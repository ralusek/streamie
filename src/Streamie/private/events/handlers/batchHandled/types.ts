import { StreamieHandlerResult } from '@root/Streamie/types';
import { StreamieQueueOutput } from '@root/Streamie/StreamieQueue/types';

export type BatchHandledPayload<InputItem, OutputItem> = {
  result: StreamieHandlerResult<OutputItem>,
  batch: StreamieQueueOutput<InputItem, OutputItem>[],
};
