/** An object on which a property has been observed. */
export type ObservedObject = any;

/** An observable value. */
export type ObservedValue = any;

/** A computed and memoized value. */
export type ComputedValue = any;

/** */
export type ValueReference = {
  previousValue: ObservedValue,
  currentValue: ObservedValue
};

export type GetterReference = {
  isStale: boolean
};

export type ChangeListener = (
  value: ObservedValue | ComputedValue,
  prop: string,
  obj: ObservedObject
) => void;
