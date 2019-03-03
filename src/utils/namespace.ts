/**
 * Accepts an instance as an argument and returns a corresponding object to act
 * as a private namespace.
 * @param self - The instance to associate with a private namespace
 * @returns - The private namespace.
 */
export type P<Instance extends object, PrivateNamespace> = (self: Instance) => PrivateNamespace;

/**
 * Returns a getter capable of creating private namespaces.
 * @returns - The getter for private namespaces.
 */
export default <Instance extends object, PrivateNamespace>(): P<Instance, PrivateNamespace> => {
  const namespace:WeakMap<Instance, PrivateNamespace | any> = new WeakMap();

  return (self: Instance): PrivateNamespace => {
    if (!namespace.has(self)) namespace.set(self, {});
    return namespace.get(self);
  }
}
