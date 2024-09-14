import { getElementsAndUpdateDbFunction, getPostsLikesAndUpdateDbFunction, analyzeRecordsFunction } from "./function";

export const functions = [
  getElementsAndUpdateDbFunction,
  getPostsLikesAndUpdateDbFunction(0), // elements  [0] ~ [18]
  getPostsLikesAndUpdateDbFunction(1), //          [19] ~ [37]
  analyzeRecordsFunction(0),
  analyzeRecordsFunction(1),
];

export { inngest } from './inngest'
