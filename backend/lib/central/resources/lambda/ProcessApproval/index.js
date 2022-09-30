const {Approvals} = require("/opt/nodejs/approvals")
const {DataDomain} = require("/opt/nodejs/data-domain")

exports.handler = async(event) => {
    const userId = DataDomain.extractUserId(event)
    const body = JSON.parse(event.body)
    const {sourceAccountId, requestIdentifier, actionType} = body

    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    const owner = await DataDomain.isOwner(userId, sourceAccountId, process.env.USER_MAPPING_TABLE_NAME)

    if (!owner) {
        payload.statusCode = 404
        payload.body = JSON.stringify({"error": "Object not found"})
    } else {
        try {
            const resp = await Approvals.processApproval(sourceAccountId, requestIdentifier, actionType, process.env.APPROVALS_TABLE_NAME)
            payload.body = JSON.stringify({"result": resp})
        } catch (e) {
            payload.statusCode = 400
            payload.body = JSON.stringify({"error": "Invalid request"})
        }
        
    }

    return payload
}