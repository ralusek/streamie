/**
 * Determines if the item is a valid multi-input.
 */
export const isMulti = <InputItem>(
  item: InputItem | InputItem[],
  flatten: boolean,
): item is InputItem[] => {
  if (!flatten) return false;
  if (Array.isArray(item)) throw new Error('Streamie error: expected input as array if "flatten" is set to true.');
  return true;
};
