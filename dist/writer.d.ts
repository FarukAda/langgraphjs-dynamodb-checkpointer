import { DynamoDBWriteItem, WriterProps } from "./types";
export declare class Writer {
    readonly thread_id: string;
    readonly checkpoint_ns: string;
    readonly checkpoint_id: string;
    readonly task_id: string;
    readonly idx: number;
    readonly channel: string;
    readonly type: string;
    readonly value: Uint8Array;
    constructor({ thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value, }: WriterProps);
    toDynamoDBItem(): DynamoDBWriteItem;
    static fromDynamoDBItem({ thread_id_checkpoint_id_checkpoint_ns, task_id_idx, channel, type, value, }: DynamoDBWriteItem): Writer;
    static getPartitionKey({ thread_id, checkpoint_id, checkpoint_ns, }: {
        thread_id: string;
        checkpoint_id: string;
        checkpoint_ns: string;
    }): string;
    static separator(): string;
}
//# sourceMappingURL=writer.d.ts.map