const fetchButton = document.getElementById('fetchButton');
const fetchInput = document.getElementById('fetchInput');

var cyFirstRunFlag = false; // cy.run()が1度実行完了したら(相関図が出てる状態になったらtrue)
var cyRunningFlag = false; // cy.run()実行中かのフラグ
var tappingCard = false; // ノードタップ時のフラグ
var resizeEventFlag = false; // リサイズイベントの処理フラグ
var resizeTimer; // リサイズイベントを適切に制御するためのタイマー
var shareRunningFlag = false; // シェア画像処理中フラグ
var gaugeflag = false; // ゲージ表示フラグ

// Cytoscape.js
var cy = cytoscape({
  container: document.getElementById('cy'), // container to render in

  elements: [],
});

// Enterキーが押されたときにfetch処理を実行
fetchInput.addEventListener('keyup', function(event) {
    if (event.keyCode === 13) {
        event.preventDefault();
        fetchButton.click();
    }
});

fetchButton.addEventListener('click', (event) => {
  if (!cyRunningFlag) {
    handle = fetchInput.value.trim();
    
    // エラー検査
    if (!handle) {
      showAlert("テキストが入力されていません");
      return;
    } else if (!/\./.test(handle) && /@/.test(handle)) {
      handle = handle.replace("@", "") + ".bsky.social";
      showAlert("有効なhandleではありません。もしかして", handle);
      return;
    } else if (!/\./.test(handle)) {
      showAlert("有効なhandleではありません。もしかして", handle+".bsky.social");
      return;
    } else if (/@/.test(handle)) {
      handle = handle.replace("@", "");
      showAlert("有効なhandleではありません。もしかして", handle);
      return;
    }
    
    generateGraph(handle);
  } else {
    showAlert("画像生成中です");
  }
});

async function generateGraph(handle) {
  const NODE_NUM = 36;

  try {
    $('#titleContainer').fadeOut();
    $('#bottom-left').fadeIn('slow');
    cyRunningFlag = true;
    if (gaugeflag) {
      $('#gauge-container').fadeOut();
      gaugeflag = false;
    };

    document.getElementById('loading').style.display = 'block'; // くるくる表示開始
    var elm = cy.$('node, edge');
    cy.remove(elm);
    const data = await fetchData(handle, NODE_NUM);
    // console.log(data);
    cy.add(data);
    cy.style([
      {
        selector: 'node',
        style: {
          'width': 'data(rank)',
          'height': 'data(rank)',
          'background-fit': 'contain',
          'background-image': 'data(img)',
        },
      },
      {
        selector: 'edge',
        style: {
          'width': 'data(engagement)',
          'display': 'none',
          'curve-style': 'unbundled-bezier',
          'target-arrow-shape': 'triangle'
        },
      }
    ]);
    cy.layout({
      // cose ---
      // name: 'cose',
      // animate: false,
      // nodeOverlap: 1,
      // nodeRepulsion: function( node ){ return 1e7; },
      // cola ---
      // name: 'cola',
      // animate: false,
      // concentric ---
      name: 'concentric',
      animate: true,
      padding: 10,
      startAngle: Math.PI * 2 * Math.random(), // ノードの開始位置を360度ランダムに
      concentric: function(node) {
        return node.data('level');
      },
      levelWidth: function( nodes ){
        return 1;
      },
      stop: function() {
        document.getElementById('loading').style.display = 'none'; // くるくる表示終了
        cyRunningFlag = false; // 描画後にフラグクリアすることで描画瞬間でのキャプチャを防ぐ
      },
    }).run();
    cy.userPanningEnabled(false);
    cy.boxSelectionEnabled(false);
    cyFirstRunFlag = true;
    
    window.setTimeout(() => {  // cy.run()と同時に表示させるとfadeInが効かないので時間差をつける
      $('#shareButton').fadeIn();
    }, 1000);

  } catch (error) {
    console.error('Error fetching data:', error);
    showAlert("ブラウザでエラーが発生しました");
  }
}

async function fetchData(handle, nodenum) {
  handle = encodeURIComponent(handle);
  const response = await fetch(`/generate?handle=${handle}&nodenum=${nodenum}`, {
    headers: {
      'Content-Type': 'application/json'
    }
  });
  // エラー処理
  if (!response.ok) {
    const errorData = await response.json();
    showAlert("サーバでエラーが発生しました: " + errorData.message);
    document.getElementById('loading').style.display = 'none'; // くるくる表示終了
    cyRunningFlag = false;
    return;
  }
  const data = await response.json();
  return data;
}

// アラートが表示されるときの処理
function showAlert(text, handle) {
  if (handle) {
    // console.log("detect")
    $('#alert').html(text + ` <a id="handleLink" class="link-underline-primary" style="cursor: pointer;">${handle}</a> ？`);
    $('#alert').fadeIn();
    $('#handleLink').one('click', function() {
      hideAlert();
      generateGraph(handle);
    });
  } else {
    $('#alert').text(text);
    $('#alert').fadeIn();
  };
}

// アラートを非表示にする処理
function hideAlert() {
  $('#alert').fadeOut();
}

async function shareGraph() {
  if (!cyRunningFlag && !shareRunningFlag) {
    document.getElementById('loading').style.display = 'block'; // くるくる表示開始
    shareRunningFlag = true;

    // bg
    var randomColor = generateRandomColor();

    var blob = await cy.png({
      output: "blob",
      bg: randomColor,
      full: true,
      maxWidth: 750,
      maxHeight: 750,
    });

    // サーバにblobを投げ合成してもらい、base64uriを受け取る
    var formData = new FormData();
    formData.append('image', blob);
    var response = await fetch('/upload', {
        method: 'POST',
        body: formData,
    });
    var json = await response.json();

    // Set image source
    document.getElementById('popupImageShare').src = json.uri;

    document.getElementById('loading').style.display = 'none'; // くるくる表示終了
    shareRunningFlag = false;

    // Show Bootstrap modal
    $('#shareModal').modal('show');
  } else {
    showAlert("相関図を生成後、画像シェアができます");
  }
}

// ランダムな背景色を生成する関数
function generateRandomColor() {
  var hue = Math.floor(Math.random() * 360); // 色相をランダムに選択（0から359）
  var saturation = Math.floor(Math.random() * 31) + 60; // 彩度を60から90の間でランダムに選択
  var lightness = Math.floor(Math.random() * 21) + 60; // 明度を40から80の間でランダムに選択
  return 'hsl(' + hue + ', ' + saturation + '%, ' + lightness + '%)'; // HSLカラーモデルで色を返す
}

// テキストボックスオートフォーカス
window.onload = function() {
  fetchInput.focus();
};

$(document).ready(() => {
  // どこかをクリックしたときの処理
  cy.on('tap', (evt) => {
    // console.log("tap")
    if ($('#alert').is(':visible')) {
    // アラートを非表示にする
      hideAlert();
    }
  });
  
  // カード表示
  cy.on('tap', 'node', function(evt){
    var tappedNode = evt.target;
    var handle = tappedNode.data('handle');

    $('#cardTitle').text(tappedNode.data('name'));
    $('#cardSubtitle').text("@"+handle);
    $('#cardLink').attr('href', "https://bsky.app/profile/" + handle);
    
    // フォローバッジ変更
    $('#card-badge').removeClass('bg-success');
    $('#card-badge').removeClass('bg-danger');
    if (tappedNode.data('level') == 5) {
      // 中心ノードなら
      $('#card-badge').text("");
    } else if (JSON.parse(tappedNode.data('following'))) {
      $('#card-badge').text("Following");
      $('#card-badge').addClass('bg-success');
    } else {
      $('#card-badge').text("Not Following");
      $('#card-badge').addClass('bg-danger');
    };

    if (!$('#card').is(':visible') || $('#card').data('nodeId') !== tappedNode.id()) {
      $('#card').data('nodeId', tappedNode.id());
      $('#card').fadeIn();
      tappingCard = true;
    }

    // 生成ボタン押された
    $('#regenerateButton').off('click').click(function(evt) {
      evt.stopPropagation();
      generateGraph(handle);
      $('#card').fadeOut();
      tappingCard = false;
    });

    // 関係ボタン押された
    $('#socialButton').off('click').click(async function(evt) {
      const NODE_NUM = 1000;

      evt.stopPropagation();
      document.getElementById('loading').style.display = 'block'; // くるくる表示開始
      gaugeflag = true;

      // 中心ノードを取得
      var centerNode = cy.nodes().filter(function(node) {
        return node.data('level') == 5;
      }).first();

      // サーバで相手側の相関図生成
      const data = await fetchData(handle, NODE_NUM);
      
      // 相手から自分の関係抽出
      const edgeTappedNodeToCenterNode = data.filter(d => {
        return (d.group == 'edges') && (d.data.target == centerNode.data('id'));
      });
      cy.add(edgeTappedNodeToCenterNode);

      // 自分と相手の間だけエッジを表示
      cy.edges().forEach(function(edge){
        if(edge.source().id() === tappedNode.id() && edge.target().id() === centerNode.id()){
          edge.style('display', 'element'); // タップされたノードから中心ノードへのエッジ
        } else if (edge.source().id() === centerNode.id() && edge.target().id() === tappedNode.id()) {
          edge.style('display', 'element'); // 中心ノードからタップされたノードへのエッジ
        } else {
          edge.style('display', 'none'); // それ以外のエッジは非表示
        }
      });

      // タップされたノードと中心のノード以外のノードを削除
      cy.nodes().forEach(function(node){
        if(node.id() !== tappedNode.id() && node.id() !== centerNode.id()){
          node.remove();
        }
      });

      // ノードのサイズを設定
      cy.style().selector('node').style({
        'width': 150,
        'height': 150
      }).update(); // スタイルの更新

      // gridレイアウトを適用
      cy.layout({ 
        name: 'grid',
        padding: 100,
      }).run();

      // ゲージ作成
      var gauge = new Gauge(document.getElementById('gauge-container')).setOptions({
        id: "gauge-container", // Container element id
        value: 0, // Initial value
        min: 0, // Minimum value
        max: 100, // Maximum value
        title: "Gauge", // Gauge title
        label: "", // Unit label
        levelColors: ["#FF0000", "#FFFF00", "#00FF00"], // Colors for different levels
        gaugeWidthScale: 0.4, // Width of the gauge
        counter: true, // Show value counter
        formatNumber: true // Format numbers
      });
      gauge.animationSpeed = 255;

      // エンゲージメントを取得
      var edge1 = cy.edges().filter(function(edge) {
        return edge.data('source') == centerNode.id() && edge.data('target') == tappedNode.id();
      });
      var edge2 = cy.edges().filter(function(edge) {
        return edge.data('source') == tappedNode.id() && edge.data('target') == centerNode.id();
      });
      const minEngagement = Math.min(edge1.data('rawEngagement'), edge2.data('rawEngagement'));
      const maxEngagement = Math.max(edge1.data('rawEngagement'), edge2.data('rawEngagement'));
      const socialvalue = (minEngagement / maxEngagement) * 100;

      // ゲージ描画
      gauge.set(socialvalue);
      $('#gauge-container').fadeIn();
      
      document.getElementById('loading').style.display = 'none'; // くるくる表示終了
    });
  });

  // カード消す
  cy.on('tap', (evt) => {
    if ($('#card').is(':visible') && !$(evt.target).closest('#card').length && !tappingCard) {
      $('#card').fadeOut();
    }
    tappingCard = false;
  })

  // ノードマウスオーバーで半透明
  cy.on('mouseover', 'node', function(event){
    var node = event.target;
    node.style('opacity', '0.5');
  });
  cy.on('mouseout', 'node', function(event){
    var node = event.target;
    node.style('opacity', '1');
  });

  // パーティクル
  cy.on('tap', 'node', function(event){
    var node = event.target;
    var position = node.renderedPosition(); // タップされたノードのcytoscape.jsの座標系での位置を取得
    var engagement = node.data('engagement');

    // タップ時にp5.js側のキャンバスをリサイズ
    // updateParticlePositions(position);
    resizeCanvas(windowWidth, windowHeight);
    
    // Create particles
    emitParticlesFromNode(position, engagement); // パーティクルを発生させる
  });

  // ウィンドウのリサイズイベントを検知して、グラフをフィットさせる
  cy.on('resize', function() {
    if (!resizeEventFlag) {
      clearTimeout(resizeTimer); // タイマーをクリアして連続しての実行を防ぐ
      resizeTimer = setTimeout(function() {
        cy.resize(); // 描画領域のサイズをウィンドウのサイズに合わせる
        cy.fit('node, edge', 10); // グラフをフィットさせる

        // パーティクルの位置を更新
        // updateParticlePositions(centerNodePosition);

        resizeEventFlag = false;
      }, 200); // イベントが一定時間後に発火するように遅延を設定する
      resizeEventFlag = true; // フラグをセット
    };
  });
});
