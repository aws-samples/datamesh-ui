const {DataDomain} = require("/opt/nodejs/data-domain")

exports.handler = async(event) => {
    const payload = {
        "statusCode": "200",
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        }
    }

    const domainIds = await DataDomain.getUserDataDomains(DataDomain.extractUserId(event), process.env.USER_MAPPING_TABLE_NAME)

    payload.body = JSON.stringify({domainIds})

    return payload
}