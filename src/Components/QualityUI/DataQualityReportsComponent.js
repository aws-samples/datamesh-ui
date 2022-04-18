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
import { GlueClient, GetTableCommand } from "@aws-sdk/client-glue";
import Amplify, { Auth, API } from "aws-amplify";
import { useEffect, useState } from "react";
import { Flashbar, BreadcrumbGroup, ColumnLayout, Container, Box, SpaceBetween, Header, Link, Table } from "@awsui/components-react";
import { useParams } from "react-router";
import ValueWithLabel from "../ValueWithLabel";
import DatabaseDetailsComponent from "../DatabaseDetailsComponent";

const config = Amplify.configure();

function DataQualityReportsComponent(props) {
  
  const [dataQualityReports, setDataQualityReports] = useState([]);
  const [table, setTable] = useState();
  const [tableNotFound, setTableNotFound] = useState(false);
  const [reportsNotFound, setReportsNotFound] = useState(false);
    
  const {dbname, tablename} = useParams();
  
  
  useEffect(async() => {
        const credentials = await Auth.currentCredentials();
        const glueClient = new GlueClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});
        
        try {
            const response = await glueClient.send(new GetTableCommand({DatabaseName: dbname, Name: tablename}));
            const table = response.Table;
            setTable(table);
            
            try
            {
                const currentSession = await Auth.currentSession();
                const token = await currentSession.idToken.jwtToken;
                
                const requestInfo = {
                    headers: {
                      Authorization: token
                    },
                    queryStringParameters: {
                    'owner': table.Owner,
                    'tableLocation': encodeURIComponent(table.StorageDescriptor.Location)
                    },
                };
                
                const data_quality_reports = await API.get('DataQualityAPIGW', '/data_quality/data_quality_reports', requestInfo);
                setDataQualityReports(data_quality_reports);
            }
            catch (reportsRetrievalError) {
                setReportsNotFound(true);
            }
        } catch (tableRetrievalError) {
            setTableNotFound(true);
        }
    }, []);

    if (tableNotFound) {
        return <Flashbar items={[{header: "Invalid Request", type: "error", content: "There's no table found for the given parameter."}]} />;
    }
    else if (reportsNotFound) {
        return <Flashbar items={[{header: "Error retrieving reports", type: "error", content: "Unable to retrieve reports.  Please check permissions."}]} />;
    }
    else if (table)
    {
        return (
            <div>
                <BreadcrumbGroup items={[
                            { text: "Databases", href: "/"},
                            { text: dbname, href: "/tables/"+dbname },
                            { text: "Data Quality Reports ("+tablename+")" }
                        ]} />
                <DatabaseDetailsComponent dbName={dbname} />
                <Box margin={{top: "l"}}>
                    <Container header={<Header variant="h2">Table Details</Header>}>
                        <ColumnLayout columns={2} variant="text-grid">
                            <SpaceBetween size="m">
                                <ValueWithLabel label="Table">
                                    {tablename}
                                </ValueWithLabel>
                            </SpaceBetween>
                            <SpaceBetween size="m">
                                <ValueWithLabel label="Location">
                                    {table.StorageDescriptor.Location}
                                </ValueWithLabel>
                            </SpaceBetween>
                        </ColumnLayout>
                    </Container>
                </Box>
                <Box margin={{top: "m"}}>
                    <Table
                        columnDefinitions={[
                            {
                                header: "Report Date",
                                cell: item => item.lastModified
            
                            },
                            {
                                header: "Actions",
                                cell: item => <Link variant="primary" href={"/data-quality-report-results/"+dbname+"/"+tablename+"/"+encodeURIComponent(item.bucket)+"/"+encodeURIComponent(item.key)}>View Report</Link>
                            }
                        ]}
                        items={dataQualityReports}
                        header={<Header variant="h2">Data Quality Reports</Header>}
                     />
                </Box>
            </div>
        );
    }
    else {
        return null;
    }
}

export default DataQualityReportsComponent;