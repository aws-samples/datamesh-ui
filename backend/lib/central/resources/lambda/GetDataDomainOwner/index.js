const {DataDomain} = require("/opt/nodejs/data-domain")

exports.handler = async(event) => {
    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    const accountId = event.queryStringParameters.accountId

    if (!accountId) {
        payload.statusCode = 400
        payload.body = JSON.stringify({"error": "Missing required parameters"})
    } else {
        const isOwner = await DataDomain.isOwner(DataDomain.extractUserId(event), accountId, process.env.USER_MAPPING_TABLE_NAME)
        if (isOwner) {
            payload.body = JSON.stringify({"message": "ok"})
        } else {
            payload.statusCode = 404
            payload.body = JSON.stringify({"error": "Not found"})
        }
    }

    return payload
}