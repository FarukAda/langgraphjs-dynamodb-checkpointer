import { type DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import type { RunnableConfig } from "@langchain/core/runnables";
import { BaseCheckpointSaver, type SerializerProtocol, type CheckpointTuple, type Checkpoint, type CheckpointMetadata, type CheckpointListOptions, type PendingWrite } from "@langchain/langgraph-checkpoint";
export declare class DynamoDBSaver extends BaseCheckpointSaver {
    private readonly client;
    private docClient;
    private readonly checkpointsTableName;
    private readonly writesTableName;
    constructor({ clientConfig, serde, checkpointsTableName, writesTableName, }: {
        clientConfig?: DynamoDBClientConfig;
        serde?: SerializerProtocol;
        checkpointsTableName: string;
        writesTableName: string;
    });
    getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined>;
    list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple>;
    put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<RunnableConfig>;
    putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void>;
    private getWritePartitionKey;
    private getWriteSortKey;
    private validateConfigurable;
    deleteThread(threadId: string): Promise<void>;
}
//# sourceMappingURL=saver.d.ts.map