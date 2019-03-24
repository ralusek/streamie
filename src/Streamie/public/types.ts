/**
 * Streamie public state.
 */
export type Streamie<InputItem = any, OutputItem = any> = {
  // Methods
  push: (item: InputItem) => PromiseLike<OutputItem>,

  // Derived
  isAtBacklogCapacity: boolean,
};
