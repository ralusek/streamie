/**
 * StreamieNode Id.
 */
export type StreamieId = string;

/**
 * Generates a new StreamieNode Id.
 */
export default (): StreamieId => {
  const result: string[] = [];
  return crypto.getRandomValues(new Uint32Array(4)).reduce((arr, item) => {
    const val = item.toString(36);
    const paddingNeeded = 7 - val.length;
    const zeroesPad = paddingNeeded ? (new Array(paddingNeeded)).fill('0').join('') : '';
    arr.push(zeroesPad + val);
    return arr;
  }, result).join('-');
};
