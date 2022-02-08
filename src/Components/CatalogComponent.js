/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import Amplify, { Auth } from "aws-amplify";
import { useEffect, useState } from "react";
import {GlueClient, GetDatabasesCommand} from '@aws-sdk/client-glue';
import { Box, Header, Link, Table } from "@awsui/components-react";

const config = Amplify.configure();

function CatalogComponent(props) {
    const [databases, setDatabases] = useState([]);
    const [response, setResponse] = useState();
    const [nextToken, setNextToken] = useState(null);

    useEffect(async() => {
        const credentials = await Auth.currentCredentials();
        const glue = new GlueClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
        const results = await glue.send(new GetDatabasesCommand({NextToken: nextToken}));
        setDatabases(databases => databases.concat(results.DatabaseList));
        setResponse(results);
    }, [nextToken]);

    return (
        <div>
            <Table
                footer={<Box textAlign="center" display={(response && response.NextToken) ? "block" : "none"}><Link variant="primary" onFollow={(event) => setNextToken(response.NextToken)}>View More</Link></Box>}
                columnDefinitions={[
                    {
                        header: "Database Name",
                        cell: item => item.Name

                    },
                    {
                        header: "Location",
                        cell: item => item.LocationUri
                    },
                    {
                        header: "Owner",
                        cell: item => item.Parameters.data_owner_name + " ("+item.Parameters.data_owner+")"
                    },
                    {
                        header: "Actions",
                        cell: item => <Link variant="primary" href={"/tables/"+item.Name}>Request Access</Link>
                    }
                ]}

                items={databases}
                header={<Header variant="h2">Catalog - Databases</Header>}
             />
        </div>
    );
}

export default CatalogComponent;