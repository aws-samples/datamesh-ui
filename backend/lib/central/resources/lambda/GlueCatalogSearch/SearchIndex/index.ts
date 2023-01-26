import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import axios from "axios";
import { aws4Interceptor } from "aws4-axios";
import { TableSearchInformation } from "../utilities";

const opensearchDomainEndpoint = process.env.DOMAIN_ENDPOINT;
const awsRegion = process.env.AWS_REGION;

const interceptor = aws4Interceptor({
    region: awsRegion,
    service: "aoss",
});

axios.interceptors.request.use(interceptor);

interface OpensearchHit {
    _id: string;
    _score: number;
    _source: TableSearchInformation;
}

exports.handler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    console.log(event);
    console.log(opensearchDomainEndpoint);

    const searchValue = event.pathParameters?.searchTerm;
    console.log(`Search term is: "${searchValue}"`);

    try {
        const searchPath = `https://${opensearchDomainEndpoint}/${process.env.OPENSEARCH_INDEX}/_search`;
        const searchBody = {
            query: {
                multi_match: {
                    query: searchValue,
                    type: "bool_prefix",
                    fields: [
                        "catalogName",
                        "databaseName",
                        "tableName",
                        "columnNames",
                    ],
                },
            },
        };
        const response = await axios.post(searchPath, searchBody, {
            headers: {
                "Content-Type": "application/json",
            },
        });
        console.log(response.data);

        const hits: OpensearchHit[] = response.data?.hits?.hits ?? [];
        const searchResponse = hits.map((hit) => ({
            documentId: hit._id,
            score: hit._score,
            tableInformation: hit._source,
        }));

        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' // replace with hostname of frontend 
              },
            body: JSON.stringify(searchResponse),
        };
    } catch (error) {
        console.log(error);
        return {
            statusCode: 500,
            body: "Internal search error",
        };
    }
};
