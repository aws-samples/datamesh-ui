const AWS = require("aws-sdk")

exports.handler = async(event) => {
    const userClaims = event.requestContext.authorizer.jwt.claims
    const sfnClient = new AWS.StepFunctions()
    const ddbClient = new AWS.DynamoDB()

    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    const body = JSON.parse(event.body)

    const {stateMachineArn, input, domainId} = body

    const userMapping = await ddbClient.getItem({
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
    }).promise()

    if (userMapping && userMapping.Item) {
        const execResult = await sfnClient.startExecution({stateMachineArn,input}).promise()
        payload.body = JSON.stringify(execResult)
    } else {
        payload.statusCode = 404
        payload.body = JSON.stringify({"error": "Domain not found"})
    }

    return payload;
}