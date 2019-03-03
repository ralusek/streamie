import Streamie from "@root/Streamie";

/**
 * Determine if any of the downstream children are in the isBlocked state.
 * @param children - The children to check on.
 * @returns - Whether any children are blocking.
 */
export default (children: Set<Streamie>): boolean => {
  for (let child of children) {
    if (child.state.isBlocked) return true;
  }
  return false;
};
