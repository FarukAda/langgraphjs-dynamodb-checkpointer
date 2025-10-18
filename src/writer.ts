import { DynamoDBWriteItem, WriterProps } from "./types";

export class Writer {
  readonly thread_id: string;
  readonly checkpoint_ns: string;
  readonly checkpoint_id: string;
  readonly task_id: string;
  readonly idx: number;
  readonly channel: string;
  readonly type: string;
  readonly value: Uint8Array;

  constructor({
    thread_id,
    checkpoint_ns,
    checkpoint_id,
    task_id,
    idx,
    channel,
    type,
    value,
  }: WriterProps) {
    this.thread_id = thread_id;
    this.checkpoint_ns = checkpoint_ns;
    this.checkpoint_id = checkpoint_id;
    this.task_id = task_id;
    this.idx = idx;
    this.channel = channel;
    this.type = type;
    this.value = value;
  }

  toDynamoDBItem(): DynamoDBWriteItem {
    return {
      thread_id_checkpoint_id_checkpoint_ns: Writer.getPartitionKey({
        thread_id: this.thread_id,
        checkpoint_id: this.checkpoint_id,
        checkpoint_ns: this.checkpoint_ns,
      }),
      task_id_idx: [this.task_id, this.idx].join(Writer.separator()),
      channel: this.channel,
      type: this.type,
      value: this.value,
    };
  }

  static fromDynamoDBItem({
    thread_id_checkpoint_id_checkpoint_ns,
    task_id_idx,
    channel,
    type,
    value,
  }: DynamoDBWriteItem): Writer {
    const [thread_id, checkpoint_id, checkpoint_ns] =
      thread_id_checkpoint_id_checkpoint_ns.split(this.separator());
    const [task_id, idx] = task_id_idx.split(this.separator());
    return new Writer({
      thread_id,
      checkpoint_ns,
      checkpoint_id,
      task_id,
      idx: parseInt(idx, 10),
      channel,
      type,
      value,
    });
  }

  static getPartitionKey({
    thread_id,
    checkpoint_id,
    checkpoint_ns,
  }: {
    thread_id: string;
    checkpoint_id: string;
    checkpoint_ns: string;
  }): string {
    return [thread_id, checkpoint_id, checkpoint_ns].join(this.separator());
  }

  static separator() {
    return ":::";
  }
}
