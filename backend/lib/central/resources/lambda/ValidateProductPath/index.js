const AWS = require("aws-sdk")

exports.handler = async(event) => {
    const payload = JSON.parse(event.body)

    const s3Client = new AWS.S3()

    const results = {
        "valid": true,
        "products": {}
    }

    const bucket = payload.bucket;

    for (const prod of payload.products) {
        try {
            const result = await s3Client.listObjectsV2({
                Bucket: bucket,
                Prefix: prod.prefix
            }).promise()

            if (!result.Contents || result.Contents.length == 0) {
                results.valid = false
                prod.error = "Invalid path or location is empty."
            }
        } catch (e) {
            console.log(JSON.stringify(e))
            results.valid = false
            prod.error = "Unexpected error, please try again."
        }

        results.products[prod.id] = prod
    }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*'
        },
        "body": JSON.stringify(results)
    }
}