import { schema } from "@lab/multiplayer-channels";
import { server } from "./server";
import { createPublisher } from "@lab/multiplayer-server";

export const publisher = createPublisher(schema, () => server);
