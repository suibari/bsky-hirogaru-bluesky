import { BSKY_IDENTIFIER, BSKY_APP_PASSWORD, KV_REST_API_URL, KV_REST_API_TOKEN } from '$env/static/private';
import { MyBlueskyer } from '$lib/server/bluesky.js';
import { getElements, removeDuplicatesNodes, removeInvalidLinks, imageUrlToBase64 } from '$lib/server/databuilder.js';
import { TimeLogger, ExecutionLogger } from '$lib/server/logger.js';
import { createClient } from '@vercel/kv';
const kv = createClient({
  url: KV_REST_API_URL,
  token: KV_REST_API_TOKEN
});
const agent = new MyBlueskyer();
const execLogger = new ExecutionLogger();

const THRESHOLD_NODES = 36
const THRESHOLD_TL = 1000;
const THRESHOLD_LIKES = 100;
const SCORE_REPLY = 10;
const SCORE_LIKE = 1;

export async function getData(handle) {
  try {
    const timeLogger = new TimeLogger();
    timeLogger.tic();

    // DBにデータがあればそれを出しつつ裏で更新、なければデータ収集しセット
    const elements = await kv.get(handle);
    if (elements === null) {
      // データがないので同期処理で待って最低限のデータを渡す
      elements = await getElementsAndSetDb(handle, THRESHOLD_TL, THRESHOLD_LIKES);
    } else {
      // データがあれば非同期処理で裏でデータ更新
      console.log(`[WORKER] updata db: ${handle}`);
      getElementsAndSetDb(handle, Infinity, Infinity);
    }

    // DBには画像URLを入れているので、クライアント送信前にそれをbase64URIに変換
    await Promise.all(elements.map(async elem => {
      if (elem.group === 'nodes') {
        elem.data.img = await imageUrlToBase64(elem.data.img);
      }
    }));

    execLogger.incExecCount();
    const elapsedTime = timeLogger.tac();
    const execCount = execLogger.getExecCount();
    console.log("[INFO] exec time was " + elapsedTime + " [sec], total exec count is " + execCount + ".");
    
    // console.log(elements);
    return elements;

  } catch(e) {
    throw e;
  }
}

export async function getElementsAndSetDb(handle, threshold_tl, threshold_like) {
  await agent.createOrRefleshSession(BSKY_IDENTIFIER, BSKY_APP_PASSWORD);

  let response;
  response = await agent.getProfile({actor: handle});
  const myselfWithProf = response.data;

  // 自分のタイムラインTHRESHOLD_TL件および自分のいいねTHRESHOLD_LIKES件を取得
  let friendsWithProf = await agent.getInvolvedEngagements(handle, threshold_tl, threshold_like, SCORE_REPLY, SCORE_LIKE);

  // 要素数がTHRESHOLD_NODESに満たなければ、相互フォロー追加
  let didArray;
  if (friendsWithProf.length < THRESHOLD_NODES) {
    response = await agent.getFollows({actor: handle, limit: 50});
    const follows = response.data.follows;
    didArray = follows.map(follow => follow.did);
    const mutualWithProf = await agent.getConcatProfiles(didArray);
    friendsWithProf = friendsWithProf.concat(mutualWithProf);
  };

  // フォロー検出
  didArray = friendsWithProf.map(friend => friend.did);
  const objFollow = await agent.isFollow(myselfWithProf.did, didArray);
  for (const obj of objFollow) {
    for (const friend of friendsWithProf) {
      if (friend.did == obj.did) {
        friend.following = obj.following
      };
    };
  };

  // 重複ノード削除: getElementsより先にやらないとnodesがTHRESHOLD_NODESより少なくなる
  const allWithProf = removeDuplicatesNodes(myselfWithProf, friendsWithProf);

  // node, edge取得
  const elements = await getElements(allWithProf, objFollow);

  // 不要エッジ除去
  removeInvalidLinks(elements);

  // DBセット
  kv.set(handle, elements);

  console.log(`[INFO] analyzed elements: ${elements.length}`);

  return elements;
}