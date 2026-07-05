type Associated<IQT> = {
  // The input whose handling produced the error. This is a single item for unbatched
  // streamies, or the batch being handled for batched streamies.
  input: IQT | IQT[];
  index: number;
  timestamp: number;
};

export class StreamieQueueError<IQT> extends Error {
  public originalError: unknown;
  public associated: Associated<IQT>;

  constructor(
    message: string,
    originalError: unknown,
    associated: Associated<IQT>,
  ) {
    super(message);
    this.name = 'StreamieQueueError';
    this.originalError = originalError;
    this.associated = associated;
  }
}
