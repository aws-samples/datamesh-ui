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
import { GlueClient, GetTablesCommand, GetDatabasesCommand, GetDatabaseCommand } from "@aws-sdk/client-glue";
import { ColumnLayout, Box, BreadcrumbGroup, Flashbar, Header, Link, Table, SpaceBetween, Button, Spinner } from "@cloudscape-design/components";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import {Amplify, Auth } from "aws-amplify";
import DatabaseDetailsComponent from "./DatabaseDetailsComponent";
import RequestAccessComponent from "./RequestAccessComponent";
import ResourceLFTagsComponent from "./TBAC/ResourceLFTagsComponent";

const config = Amplify.configure();

function CatalogTablesComponent(props) {
    const {dbname} = useParams();
    
    const [tables, setTables] = useState([]);
    const [nextToken, setNextToken] = useState();
    const [response, setResponse] = useState();
    const [executionArn, setExecutionArn] = useState();
    const [requestSuccessful, setRequestSuccessful] = useState(false);
    const [spinnerVisibility, setSpinnerVisibility] = useState(false)
    const [forceRefresh, setForceRefresh] = useState(0)

    const requestAccessSuccessHandler = async(executionArn) => {
        setExecutionArn(executionArn);
        setRequestSuccessful(true);
    }

    useEffect(() => {
        async function run() {
            const credentials = await Auth.currentCredentials();
            const glue = new GlueClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
            const results = await glue.send(new GetTablesCommand({DatabaseName: dbname, NextToken: nextToken}));
            setTables(tables => tables.concat(results.TableList));
            setResponse(results);
            setSpinnerVisibility(false)
        }

        run()
    }, [nextToken, forceRefresh]);

    const refresh = () => {
        setSpinnerVisibility(true)
        setTables([])
        setForceRefresh(forceRefresh + 1)
    }

    const renderRefresh = () => {
        if (spinnerVisibility) {
            return (
                <Button disabled="true"><Spinner /> Refresh</Button>
            )
        } else {
            return (
                <Button iconName="refresh" onClick={refresh}>Refresh</Button>
            )
        }
    }

    return(
        <div>
            <BreadcrumbGroup items={[
                { text: "Data Domains", href: "/"},
                { text: dbname, href: "/tables/"+dbname }
            ]} />
            <Box margin={{top: "s", bottom: "s"}} display={requestSuccessful ? "block" : "none"}>
                <Flashbar items={[{type: "success", header: "Request Submitted ("+executionArn+")", content: "Successfully submitted request, once approved please accept RAM request."}]}></Flashbar>
            </Box>
            <DatabaseDetailsComponent dbName={dbname} />
            <Box margin={{top: "l"}}>
                <Table 
                    footer={<Box textAlign="center" display={(response && response.NextToken) ? "block" : "none"}><Link variant="primary" onFollow={(event) => setNextToken(response.NextToken)}>View More</Link></Box>}
                    columnDefinitions={[
                        {
                            header: "Table Name",
                            cell: item => item.Name
                        },
                        {
                            header: "Tags",
                            cell: item => <ResourceLFTagsComponent resourceType="table" resourceName={item.Name} resourceDatabaseName={dbname} />
                        },
                        {
                            header: "Actions",
                            cell: item => <ColumnLayout columns={2} variant="text-grid"><div><Link variant="primary" href={"/request-access/"+dbname+"/"+item.Name}>Request Per Table Access</Link></div></ColumnLayout>
                        }
                    ]}

                    items={tables}
                    header={<Header variant="h2" actions={
                        <SpaceBetween direction="horizontal" size="s">
                            {renderRefresh()}
                            <Button iconName="add-plus" href={`/product-registration/${dbname}/new`}>Register Data Products</Button>
                        </SpaceBetween>
                    }>Tables in {dbname}</Header>}
                />
            </Box>
        </div>
    );
}

export default CatalogTablesComponent;