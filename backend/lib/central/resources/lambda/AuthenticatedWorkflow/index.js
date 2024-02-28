const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");

exports.handler = async(event) => {
    const userClaims = event.requestContext.authorizer.jwt.claims
    const sfnClient = new SFNClient()
    const ddbClient = new DynamoDBClient()

    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    const body = JSON.parse(event.body)

    const {stateMachineArn, input, domainId} = body

    const userMapping = await ddbClient.send(new GetItemCommand({
        TableName: process.env.USER_MAPPING_TABLE_NAME,
        Key: {
            "userId": {
                "S": userClaims.sub
            },
            "accountId": {
                "S": domainId
            }
        },
        ConsistentRead: false
    }))

    if (userMapping && userMapping.Item) {
        const execResult = await sfnClient.send(new StartExecutionCommand({stateMachineArn,input}))
        payload.body = JSON.stringify(execResult)
    } else {
        payload.statusCode = 404
        payload.body = JSON.stringify({"error": "Domain not found"})
    }

    return payload;
}