import { P } from "@root/utils/namespace";
import Streamie from "..";
import { StreamiePrivateNamespace } from "../types";
import { EventPayload } from "@root/Emittie/types";

/** An event handler for a streamie or related event. */
export type EventHandler = (
  p: P<Streamie, StreamiePrivateNamespace>,
  self: Streamie,
  ...payloads: EventPayload[]
) => void
