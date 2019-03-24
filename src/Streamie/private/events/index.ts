// Types
import { EventName } from './types';
import { StreamieState } from '@root/Streamie/types';
import { EventCallback } from '@root/utils/Emittie/types';

// Utils
import { getKeys } from '@root/utils/getKeys';

// Handlers
import batchHandled from './handlers/batchHandled';
import itemPushed from './handlers/itemPushed';


export const bootstrap = <InputItem, OutputItem>(
  state: StreamieState<InputItem, OutputItem>,
) => {
  const handler: Partial<{ [key in EventName]: EventCallback }> = {
    [EventName.BatchHandled]: (payload) => batchHandled<InputItem, OutputItem>(state, payload),
    [EventName.ItemPushed]: (payload) => itemPushed<InputItem, OutputItem>(state, payload),
  };

  getKeys(handler).forEach(eventName => {
    const current = handler[eventName];
    if (current) state.private.emittie.on(eventName, (...args) => current(state, ...args));
  });
};
