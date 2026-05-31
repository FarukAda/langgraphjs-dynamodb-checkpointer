# langgraphjs-dynamodb-checkpointer

> # ⚠️ DEPRECATED
>
> **This package is deprecated and no longer maintained.**
>
> It has been replaced by **[`@farukada/aws-langgraph-dynamodb-ts`](https://www.npmjs.com/package/@farukada/aws-langgraph-dynamodb-ts)**.
>
> Please migrate to the new package:
>
> ```bash
> npm install @farukada/aws-langgraph-dynamodb-ts
> ```

---

Implementation of a LangGraph.js CheckpointSaver that uses AWS DynamoDB.

This package was created as an updated alternative to [langgraphjs-checkpoint-dynamodb](https://github.com/researchwiseai/langgraphjs-checkpoint-dynamodb), which is currently outdated.

## Package name

> ⚠️ Deprecated. Use [`@farukada/aws-langgraph-dynamodb-ts`](https://www.npmjs.com/package/@farukada/aws-langgraph-dynamodb-ts) instead.

```bash
@farukada/langgraphjs-dynamodb-checkpointer
```

## Required DynamoDB Tables

To be able to use this checkpointer, two DynamoDB tables are needed, one to store
checkpoints and the other to store writes. Below are some examples of how you
can create the required tables.

### Terraform

```hcl
# Variables for table names
variable "checkpoints_table_name" {
  type = string
}

variable "writes_table_name" {
  type = string
}

# Checkpoints Table
resource "aws_dynamodb_table" "checkpoints_table" {
  name         = var.checkpoints_table_name
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "thread_id"
  range_key = "checkpoint_id"

  attribute {
    name = "thread_id"
    type = "S"
  }

  attribute {
    name = "checkpoint_id"
    type = "S"
  }

  # Enable TTL for automatic cleanup
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

# Writes Table
resource "aws_dynamodb_table" "writes_table" {
  name         = var.writes_table_name
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "thread_id_checkpoint_id_checkpoint_ns"
  range_key = "task_id_idx"

  attribute {
    name = "thread_id_checkpoint_id_checkpoint_ns"
    type = "S"
  }

  attribute {
    name = "task_id_idx"
    type = "S"
  }

  # Enable TTL for automatic cleanup
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}
```

### AWS CDK

```typescript
import * as cdk from '@aws-cdk/core';
import * as dynamodb from '@aws-cdk/aws-dynamodb';

export class DynamoDbStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const checkpointsTableName = 'YourCheckpointsTableName';
        const writesTableName = 'YourWritesTableName';

        // Checkpoints Table
        new dynamodb.Table(this, 'CheckpointsTable', {
            tableName: checkpointsTableName,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            partitionKey: { name: 'thread_id', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'checkpoint_id', type: dynamodb.AttributeType.STRING },
            timeToLiveAttribute: 'ttl', // Enable TTL
        });

        // Writes Table
        new dynamodb.Table(this, 'WritesTable', {
            tableName: writesTableName,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            partitionKey: {
                name: 'thread_id_checkpoint_id_checkpoint_ns',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: { name: 'task_id_idx', type: dynamodb.AttributeType.STRING },
            timeToLiveAttribute: 'ttl', // Enable TTL
        });
    }
}

```

## Using the Checkpoint Saver

### Default

To use the DynamoDB checkpoint saver, you only need to specify the names of
the checkpoints and writes tables. In this scenario the DynamoDB client will
be instantiated with the default configuration, great for running on AWS Lambda.

```typescript
import { DynamoDBSaver } from '@farukada/langgraphjs-dynamodb-checkpointer';

const checkpointsTableName = 'YourCheckpointsTableName';
const writesTableName = 'YourWritesTableName';

const memory = new DynamoDBSaver({
    checkpointsTableName,
    writesTableName,
    ttlDays: 7, // Automatically delete checkpoints after 7 days
});

const graph = workflow.compile({ checkpointer: memory });

```

### Providing Client Configuration

If you need to provide custom configuration to the DynamoDB client, you can
pass in an object with the configuration options. Below is an example of how
you can provide custom configuration.

```typescript
const memory = new DynamoDBSaver({
    checkpointsTableName,
    writesTableName,
    clientConfig: {
        region: 'us-west-2',
        credentials: {
            accessKeyId: 'your-access-key-id',
            secretAccessKey: 'your-secret-access-key',
        },
    },
});
```

### Custom Serde (Serialization/Deserialization)

Just as with the Sqlite and MongoDB checkpoint savers, you can provide custom
serialization and deserialization functions. Below is an example of how you can
provide custom serialization and deserialization functions.

```typescript
import { serialize, deserialize } from '@ungap/structured-clone';

const serde = {
    dumpsTyped: async function (obj: unknown): Promise<[string, Uint8Array]> {
        if (obj instanceof Uint8Array) {
            return ['bytes', obj];
        } else {
            return ['json', new TextEncoder().encode(serialize(obj))];
        }
    },
    loadsTyped: async function (type: string, data: Uint8Array | string): Promise<unknown> {
        switch (type) {
            case 'json':
                return deserialize(
                    typeof data === 'string' ? data : new TextDecoder().decode(data)
                );
            case 'bytes':
                return typeof data === 'string' ? new TextEncoder().encode(data) : data;
            default:
                throw new Error(`Unknown serialization type: ${type}`);
        }
    },
};

const memory = new DynamoDBSaver({
    checkpointsTableName,
    writesTableName,
    serde,
});
```

## Status

⛔ **Deprecated.** This package is no longer maintained. Use [`@farukada/aws-langgraph-dynamodb-ts`](https://www.npmjs.com/package/@farukada/aws-langgraph-dynamodb-ts) instead.

## License

MIT

## Related Projects

- [@farukada/aws-langgraph-dynamodb-ts](https://www.npmjs.com/package/@farukada/aws-langgraph-dynamodb-ts) (successor — use this instead)
- [LangGraph.js](https://github.com/langchain-ai/langgraphjs)
- [LangChain.js](https://github.com/langchain-ai/langchainjs)
- [Original langgraphjs-checkpoint-dynamodb](https://github.com/researchwiseai/langgraphjs-checkpoint-dynamodb) (outdated)
