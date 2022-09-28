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
import {Amplify, Auth} from "aws-amplify";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { GlueClient, GetTableCommand } from "@aws-sdk/client-glue";
import { ColumnLayout, Container, Flashbar, Header, Link, Box, SpaceBetween, BreadcrumbGroup, Table, Button, Form, FormField, Input, Badge, ContentLayout} from "@cloudscape-design/components";
import ValueWithLabel from "./ValueWithLabel";
import RequestAccessComponent from "./RequestAccessComponent";
import DatabaseDetailsComponent from "./DatabaseDetailsComponent";
import ResourceLFTagsWrapper from "./TBAC/ResourceLFTagsWrapper";
import DisplayLFTagsFromContextComponent from "./TBAC/DisplayLFTagsFromContextComponent";
import DataProductStateComponent from "./DataProductStateComponent";
import TogglePiiFlagComponent from "./TogglePiiFlagComponent";

const config = Amplify.configure();

function TableDetailsComponent(props) {
    const {dbname, tablename} = useParams();
    const [table, setTable] = useState();
    const [tableNotFound, setTableNotFound] = useState(false);
    const [accessMode, setAccessMode] = useState("nrac")
    const [owner, setOwner] = useState(false)
    const [forceReload, setForceReload] = useState(1)
    const [domainId, setDomainId] = useState(null)

    useEffect(() => {
        if (props.breadcrumbsCallback) {
            props.breadcrumbsCallback(
                <BreadcrumbGroup items={[
                    { text: "Data Domains", href: "/"},
                    { text: dbname, href: "/tables/"+dbname },
                    { text: "Request Access ("+tablename+")", href: "/request-access/"+dbname+"/"+tablename }
                ]} />
            )
        }

        async function run() {
            const credentials = await Auth.currentCredentials();
            const glueClient = new GlueClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
            try {
                const response = await glueClient.send(new GetTableCommand({DatabaseName: dbname, Name: tablename}));
                const table = response.Table;
                setTable(table);
            } catch (e) {
                setTableNotFound(true);
            }
        }

        run()
    }, [forceReload]);

    const toggleCallback = () => {
        setForceReload(forceReload + 1)
    }

    const renderRequestAccess = () => {
        if (accessMode == "nrac" && !owner) {
            return (
                <Box margin={{top: "m"}}>
                    <RequestAccessComponent dbName={dbname} tableName={tablename} />
                    {/* <Box margin={{top: "s", bottom: "s"}} display={requestSuccessful ? "block" : "none"}>
                        <Flashbar items={[{type: "success", header: "Request Submitted ("+executionArn+")", content: "Successfully submitted request, once approved please accept RAM request."}]}></Flashbar>
                    </Box> */}
                </Box>  
            )
        }

        return null
    }

    if (tableNotFound) {
        return <Flashbar items={[{header: "Invalid Request", type: "error", content: "There's no table found for the given parameter."}]} />;
    } else if (table) {
        return (
            <div>
                <ContentLayout header={<Header variant="h1">{tablename}</Header>}>
                    <DatabaseDetailsComponent dbName={dbname} accessModeCallback={setAccessMode} domainIdCallback={setDomainId} ownerCallback={setOwner} />
                    <ResourceLFTagsWrapper resourceName={tablename} resourceDatabaseName={dbname}>
                        <Box margin={{top: "l"}}>
                            <Container header={<Header variant="h2">Table Details</Header>}>
                                <ColumnLayout columns={2} variant="text-grid">
                                    <SpaceBetween size="m">
                                        <ValueWithLabel label="Table">
                                            {tablename}
                                        </ValueWithLabel>
                                        <ValueWithLabel label="Tags">
                                            <DisplayLFTagsFromContextComponent resourceType="table" showDataDomain />
                                        </ValueWithLabel>
                                    </SpaceBetween>
                                    <SpaceBetween size="m">
                                        <ValueWithLabel label="Location">
                                            {table.StorageDescriptor.Location}
                                        </ValueWithLabel>
                                        <ValueWithLabel label="Crawler State">
                                            <DataProductStateComponent dbName={dbname} tableName={tablename} />
                                        </ValueWithLabel>
                                    </SpaceBetween>
                                </ColumnLayout>
                            </Container>
                        </Box>
                        <Box margin={{top: "m"}}>
                            <Table header={<Header variant="h3">Columns</Header>} items={table.StorageDescriptor.Columns} columnDefinitions={[
                                {
                                    header: "Name",
                                    cell: item => item.Name
                                },
                                {
                                    header: "Type",
                                    cell: item => item.Type
                                },
                                {
                                    header: "Tags",
                                    cell: item => <DisplayLFTagsFromContextComponent resourceType="column" resourceColumnName={item.Name} />
                                },
                                {
                                    header: "Access Approval",
                                    cell: item => <TogglePiiFlagComponent objectParameters={item.Parameters} type="column" owner={owner} domainId={domainId} dbName={dbname} tableName={tablename} columnName={item.Name} toggleCallback={toggleCallback} />
                                }
                            ]} empty={
                                <Box textAlign="center">
                                    <b>Schema would be initially populated by the crawler</b>
                                </Box>
                            } />
                        </Box>
                    </ResourceLFTagsWrapper>
                    {renderRequestAccess()}
                </ContentLayout>
            </div>
        );
    } else {
        return null;
    }
}

export default TableDetailsComponent;