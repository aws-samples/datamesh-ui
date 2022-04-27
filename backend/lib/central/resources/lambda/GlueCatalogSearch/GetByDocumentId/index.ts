import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import axios, { AxiosError } from "axios";
import { aws4Interceptor } from "aws4-axios";
import { TableSearchInformation } from "../utilities";

const opensearchDomainEndpoint = process.env.DOMAIN_ENDPOINT;
const awsRegion = process.env.AWS_REGION;

const interceptor = aws4Interceptor({
    region: awsRegion,
    service: "es",
});

axios.interceptors.request.use(interceptor);

interface OpensearchHit {
    _id: string;
    _source: TableSearchInformation;
    found: boolean;
}

exports.handler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    console.log(event);
    console.log(opensearchDomainEndpoint);

    const documentId = event.pathParameters?.documentId;
    console.log(`Document ID is: "${documentId}"`);

    try {
        const searchPath = `https://${opensearchDomainEndpoint}/${process.env.OPENSEARCH_INDEX}/_doc/${documentId}`;

        const response = await axios.get(searchPath, {
            headers: {
                "Content-Type": "application/json",
            },
        });
        console.log(response.data);

        const hit: OpensearchHit = response.data;

        if (!hit.found) {
            return {
                statusCode: 404,
                body: `Document with ID "${documentId}" not found.`,
            };
        }

        const searchResponse = {
            documentId: hit._id,
            tableInformation: hit._source,
        };

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*", // replace with hostname of frontend
            },
            body: JSON.stringify(searchResponse),
        };
    } catch (error) {
        // If index doesn't exist, we will get the expected 404. In other cases, we got an unexpected error
        if ((error as AxiosError).response?.status == 404) {
            return {
                statusCode: 404,
                body: `Document with ID "${documentId}" not found.`,
            };
        }
        console.log(error);
        return {
            statusCode: 500,
            body: "Internal error",
        };
    }
};
