import { BatchedIfConfigured, Config } from '../types';

type Associated<IQT, C extends Config> = {
  input: BatchedIfConfigured<IQT, C>;
  index: number;
  timestamp: number;
};

export class StreamieQueueError<IQT, C extends Config> extends Error {
  public originalError: unknown;
  public associated: Associated<IQT, C>;

  constructor(
    message: string,
    originalError: unknown,
    associated: Associated<IQT, C>,
  ) {
    super(message);
    this.name = 'StreamieQueueError';
    this.originalError = originalError;
    this.associated = associated;
  }
}
