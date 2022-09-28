const {DataDomain} = require("/opt/nodejs/data-domain")
const AWS = require("aws-sdk")

exports.handler = async(event) => {
    const userId = DataDomain.extractUserId(event)
    const sfnClient = new AWS.StepFunctions()

    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    const body = JSON.parse(event.body)

    const {stateMachineArn, input, domainId} = body
    const isOwner = await DataDomain.isOwner(userId, domainId, process.env.USER_MAPPING_TABLE_NAME)

    if (isOwner) {
        const execResult = await sfnClient.startExecution({stateMachineArn,input}).promise()
        payload.body = JSON.stringify(execResult)
    } else {
        payload.statusCode = 404
        payload.body = JSON.stringify({"error": "Domain not found"})
    }

    return payload;
}