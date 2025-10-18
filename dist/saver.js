"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoDBSaver = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const langgraph_checkpoint_1 = require("@langchain/langgraph-checkpoint");
const writer_1 = require("./writer");
class DynamoDBSaver extends langgraph_checkpoint_1.BaseCheckpointSaver {
    client;
    docClient;
    checkpointsTableName;
    writesTableName;
    constructor({ clientConfig, serde, checkpointsTableName, writesTableName, }) {
        super(serde);
        this.client = new client_dynamodb_1.DynamoDBClient(clientConfig || {});
        this.docClient = lib_dynamodb_1.DynamoDBDocument.from(this.client);
        this.checkpointsTableName = checkpointsTableName;
        this.writesTableName = writesTableName;
    }
    async getTuple(config) {
        const getItem = async (configurable) => {
            if (configurable.checkpoint_id != null) {
                const item = await this.docClient.get({
                    TableName: this.checkpointsTableName,
                    Key: {
                        thread_id: configurable.thread_id,
                        checkpoint_id: configurable.checkpoint_id,
                    },
                });
                return item.Item;
            }
            else {
                const result = await this.docClient.query({
                    TableName: this.checkpointsTableName,
                    KeyConditionExpression: "thread_id = :thread_id",
                    ExpressionAttributeValues: {
                        ":thread_id": configurable.thread_id,
                        ...(configurable.checkpoint_ns && {
                            ":checkpoint_ns": configurable.checkpoint_ns,
                        }),
                    },
                    ...(configurable.checkpoint_ns && {
                        FilterExpression: "checkpoint_ns = :checkpoint_ns",
                    }),
                    Limit: 1,
                    ConsistentRead: true,
                    ScanIndexForward: false, // Descending order
                });
                return result.Items?.[0];
            }
        };
        const item = await getItem(this.validateConfigurable(config.configurable));
        if (!item) {
            return undefined;
        }
        const checkpoint = (await this.serde.loadsTyped(item.type, item.checkpoint));
        const metadata = (await this.serde.loadsTyped(item.type, item.metadata));
        const writesResult = await this.docClient.query({
            TableName: this.writesTableName,
            KeyConditionExpression: "thread_id_checkpoint_id_checkpoint_ns = :thread_id_checkpoint_id_checkpoint_ns",
            ExpressionAttributeValues: {
                ":thread_id_checkpoint_id_checkpoint_ns": writer_1.Writer.getPartitionKey(item),
            },
        });
        const pendingWrites = [];
        if (writesResult.Items) {
            for (const writeItem of writesResult.Items) {
                const write = writer_1.Writer.fromDynamoDBItem(writeItem);
                const value = await this.serde.loadsTyped(write.type, write.value);
                pendingWrites.push([write.task_id, write.channel, value]);
            }
        }
        return {
            config: {
                configurable: {
                    thread_id: item.thread_id,
                    checkpoint_ns: item.checkpoint_ns,
                    checkpoint_id: item.checkpoint_id,
                },
            },
            checkpoint,
            metadata,
            parentConfig: item.parent_checkpoint_id
                ? {
                    configurable: {
                        thread_id: item.thread_id,
                        checkpoint_ns: item.checkpoint_ns,
                        checkpoint_id: item.parent_checkpoint_id,
                    },
                }
                : undefined,
            pendingWrites,
        };
    }
    async *list(config, options) {
        const { limit, before } = options ?? {};
        const thread_id = config.configurable?.thread_id;
        const expressionAttributeValues = {
            ":thread_id": thread_id,
        };
        let keyConditionExpression = "thread_id = :thread_id";
        if (before?.configurable?.checkpoint_id) {
            keyConditionExpression += " AND checkpoint_id < :before_checkpoint_id";
            expressionAttributeValues[":before_checkpoint_id"] =
                before.configurable.checkpoint_id;
        }
        const result = await this.docClient.query({
            TableName: this.checkpointsTableName,
            KeyConditionExpression: keyConditionExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            Limit: limit,
            ScanIndexForward: false, // Descending order
        });
        if (result.Items) {
            for (const item of result.Items) {
                const checkpoint = (await this.serde.loadsTyped(item.type, item.checkpoint));
                const metadata = (await this.serde.loadsTyped(item.type, item.metadata));
                yield {
                    config: {
                        configurable: {
                            thread_id: item.thread_id,
                            checkpoint_ns: item.checkpoint_ns,
                            checkpoint_id: item.checkpoint_id,
                        },
                    },
                    checkpoint,
                    metadata,
                    parentConfig: item.parent_checkpoint_id
                        ? {
                            configurable: {
                                thread_id: item.thread_id,
                                checkpoint_ns: item.checkpoint_ns,
                                checkpoint_id: item.parent_checkpoint_id,
                            },
                        }
                        : undefined,
                };
            }
        }
    }
    async put(config, checkpoint, metadata) {
        const { thread_id } = this.validateConfigurable(config.configurable);
        const [type1, serializedCheckpoint] = await this.serde.dumpsTyped(checkpoint);
        const [type2, serializedMetadata] = await this.serde.dumpsTyped(metadata);
        if (type1 !== type2) {
            throw new Error("Failed to serialize checkpoint and metadata to the same type.");
        }
        const item = {
            thread_id,
            checkpoint_ns: config.configurable?.checkpoint_ns ?? "",
            checkpoint_id: checkpoint.id,
            parent_checkpoint_id: config.configurable?.checkpoint_id,
            type: type1,
            checkpoint: serializedCheckpoint,
            metadata: serializedMetadata,
        };
        await this.docClient.put({
            TableName: this.checkpointsTableName,
            Item: item,
        });
        return {
            configurable: {
                thread_id: item.thread_id,
                checkpoint_ns: item.checkpoint_ns,
                checkpoint_id: item.checkpoint_id,
            },
        };
    }
    async putWrites(config, writes, taskId) {
        const { thread_id, checkpoint_ns, checkpoint_id } = this.validateConfigurable(config.configurable);
        if (checkpoint_id == null) {
            throw new Error("Missing checkpoint_id");
        }
        const writeItems = writes.map(async (write, idx) => {
            const [type, serializedValue] = await this.serde.dumpsTyped(write[1]);
            const item = new writer_1.Writer({
                thread_id,
                checkpoint_ns,
                checkpoint_id,
                task_id: taskId,
                idx,
                channel: write[0],
                type,
                value: serializedValue,
            });
            return {
                PutRequest: {
                    Item: item.toDynamoDBItem(),
                },
            };
        });
        const batches = [];
        for (let i = 0; i < writeItems.length; i += 25) {
            batches.push(writeItems.slice(i, i + 25));
        }
        for (const batch of batches) {
            await this.docClient.batchWrite({
                RequestItems: {
                    [this.writesTableName]: batch,
                },
            });
        }
    }
    getWritePartitionKey(item) {
        return `${item.thread_id}:${item.checkpoint_id}:${item.checkpoint_ns}`;
    }
    getWriteSortKey(item) {
        return `${item.task_id}:${item.idx}`;
    }
    validateConfigurable(configurable) {
        if (!configurable) {
            throw new Error("Missing configurable");
        }
        const { thread_id, checkpoint_ns, checkpoint_id } = configurable;
        if (typeof thread_id !== "string") {
            throw new Error("Invalid thread_id");
        }
        if (typeof checkpoint_ns !== "string" && checkpoint_ns !== undefined) {
            throw new Error("Invalid checkpoint_ns");
        }
        if (typeof checkpoint_id !== "string" && checkpoint_id !== undefined) {
            throw new Error("Invalid checkpoint_id");
        }
        return {
            thread_id,
            checkpoint_ns: checkpoint_ns ?? "",
            checkpoint_id: checkpoint_id,
        };
    }
    async deleteThread(threadId) {
        const checkpoints = await this.docClient.query({
            TableName: this.checkpointsTableName,
            KeyConditionExpression: "thread_id = :thread_id",
            ExpressionAttributeValues: {
                ":thread_id": threadId,
            },
        });
        if (checkpoints.Items && checkpoints.Items.length > 0) {
            const deleteRequests = checkpoints.Items.map((item) => ({
                DeleteRequest: {
                    Key: {
                        thread_id: item.thread_id,
                        checkpoint_id: item.checkpoint_id,
                    },
                },
            }));
            // Delete checkpoints in batches of 25 (DynamoDB limit)
            for (let i = 0; i < deleteRequests.length; i += 25) {
                const batch = deleteRequests.slice(i, i + 25);
                await this.docClient.batchWrite({
                    RequestItems: {
                        [this.checkpointsTableName]: batch,
                    },
                });
            }
            // Delete associated writes
            for (const checkpoint of checkpoints.Items) {
                const writes = await this.docClient.query({
                    TableName: this.writesTableName,
                    KeyConditionExpression: "thread_id_checkpoint_id_checkpoint_ns = :pk",
                    ExpressionAttributeValues: {
                        ":pk": writer_1.Writer.getPartitionKey({
                            thread_id: checkpoint.thread_id,
                            checkpoint_id: checkpoint.checkpoint_id,
                            checkpoint_ns: checkpoint.checkpoint_ns,
                        }),
                    },
                });
                if (writes.Items && writes.Items.length > 0) {
                    const deleteWriteRequests = writes.Items.map((item) => ({
                        DeleteRequest: {
                            Key: {
                                thread_id_checkpoint_id_checkpoint_ns: item.thread_id_checkpoint_id_checkpoint_ns,
                                task_id_idx: item.task_id_idx,
                            },
                        },
                    }));
                    for (let i = 0; i < deleteWriteRequests.length; i += 25) {
                        const batch = deleteWriteRequests.slice(i, i + 25);
                        await this.docClient.batchWrite({
                            RequestItems: {
                                [this.writesTableName]: batch,
                            },
                        });
                    }
                }
            }
        }
    }
}
exports.DynamoDBSaver = DynamoDBSaver;
//# sourceMappingURL=saver.js.map