// Types
import { GetterReference, ValueReference, ObservedValue, ComputedValue, ObservedObject, ChangeListener } from "./types";

// Semaphores
const computedGetterStack: GetterReference[] = [];
const circularReferenceGuard: WeakSet<GetterReference> = new WeakSet();
let changeListenerCurrentlyRegistering: ChangeListener;

/**
 * Gets a reference to any getter currently at the top of the stack.
 * @returns Latest getter reference added to stack, if present.
 */
function _getCurrentGetterFromStack(): GetterReference {
  const len = computedGetterStack.length;
  return len ? computedGetterStack[len - 1] : null;
}


/**
 * Sets a value as observable on an object. Any access of this value during
 * the computation of a computed property will associate the computed property's
 * getter function with this property. Any change to this value will invalidate
 * the memoized state of the computed getter. Only the execution frame of the
 * last called computed property getter is considered, as any higher execution
 * frames are only accesssing this value through that computed property.
 * @param obj - The object to which to assign an observable property
 * @param prop - The property name
 * @param value - The starting value for the property
 * @returns The object
 */
export const observable = (
  obj: ObservedObject,
  prop: string,
  value: ObservedValue
): ObservedObject => {
  const valueReference: ValueReference = {
    previousValue: value,
    currentValue: value
  };

  // Note: Potential memory liability in cases where observers aren't explicitly
  // dereferenced. (does not happen in streamie)
  const observers: Set<GetterReference> = new Set();

  const changeListeners: Set<ChangeListener> = new Set();

  Object.defineProperty(obj, prop, {
    get: () => {
      if (changeListenerCurrentlyRegistering) changeListeners.add(changeListenerCurrentlyRegistering);
      const computedGetter = _getCurrentGetterFromStack();
      if (computedGetter && !observers.has(computedGetter)) observers.add(computedGetter);
      return valueReference.currentValue;
    },
    set: (newValue: ObservedValue) => {
      valueReference.previousValue = valueReference.currentValue;
      valueReference.currentValue = newValue;
      if (valueReference.previousValue !== newValue) {
        // Mark observers as stale
        observers.forEach((observer) => observer.isStale = true);
        // Call change listeners
        changeListeners.forEach((changeListener) => changeListener(newValue, prop, obj));
      }
    }
  });

  return obj;
};


/**
 *
 * @param obj - The object to which to assign a computed/memoized property
 * @param prop - The property name
 * @param getter - The getter function for which observable values access will be memoized against
 */
export const computed = (obj: any, prop: string, getter: () => ComputedValue) => {
  const getterReference:GetterReference = { isStale: true };
  let memoized: ObservedValue | ComputedValue;

  const changeListeners: Set<ChangeListener> = new Set();

  Object.defineProperty(obj, prop, {
    get: () => {
      if (changeListenerCurrentlyRegistering) changeListeners.add(changeListenerCurrentlyRegistering);
      if (circularReferenceGuard.has(getterReference)) throw new Error(`Error computing property "${prop}," circular reference detected.`);
      if (!getterReference.isStale) return memoized;
      const previous = memoized;
      circularReferenceGuard.add(getterReference);
      computedGetterStack.push(getterReference);
      memoized = getter();
      getterReference.isStale = false;
      computedGetterStack.pop();
      circularReferenceGuard.delete(getterReference);

      if (previous !== memoized) changeListeners.forEach((changeListener) => changeListener(memoized, prop, obj));

      return memoized;
    }
  });
};

// Todo change how this works. If a computed property is not memoized when this
// is registering, then it will also register listeners on the underlying
// observable properties, which isn't desireable.
export const onChange = (getter: () => void, changeListener: ChangeListener) => {
  if (changeListenerCurrentlyRegistering) throw new Error(`Error registering change listener, registration already in progress.`);
  changeListenerCurrentlyRegistering = changeListener;
  getter();
  changeListenerCurrentlyRegistering = null;
};
