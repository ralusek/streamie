import { Config } from '../../types';

export default (config: Config) => {
  const backpressureAt = {
    input: ((config.backpressureAt && typeof config.backpressureAt === 'object') ? config.backpressureAt.input : config.backpressureAt) || 100,
    output: ((config.backpressureAt && typeof config.backpressureAt === 'object') ? config.backpressureAt.output : config.backpressureAt) || 100,
  };

  if (
    !(Number.isInteger(backpressureAt.input) && Number.isInteger(backpressureAt.output)) ||
    (backpressureAt.input < 1 || backpressureAt.output < 1)
  ) {
    throw new Error(`backpressureAt must be a positive integer.`);
  }

  return backpressureAt;
};
