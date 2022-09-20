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
import { AppLayout, SideNavigation, Box, TopNavigation, Link, Input, Autosuggest } from "@cloudscape-design/components";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import CatalogComponent from "./CatalogComponent";
import CatalogTablesComponent from "./CatalogTablesComponent";
import {Auth} from "aws-amplify";
import WorkflowExecutionsComponent from "./WorkflowExecutionsComponent";
import WorkflowExecutionDetailsComponent from "./WorkflowExecutionDetailsComponent";
import TableDetailsComponent from "./TableDetailsComponent";
import RegisterNewProductComponent from "./RegisterNewProductComponent";
import SearchComponent from "./SearchComponent";
import DataProductDetailsComponent from "./DataProductDetailsComponent"
import { useEffect, useState } from "react";
const cfnOutput = require("../cfn-output.json");
const searchApiUrl = cfnOutput.InfraStack.SearchApiUrl;
const MIN_SEARCH_STRING_LENGTH = 1;
const axios = require("axios")

function MainComponent(props) {
    const [navUtilities, setNavUtilities] = useState([]);
    const [searchInput, setSearchInput] = useState("");
    const [searchStatusType, setSearchStatusType] = useState("pending");
    const [searchOptions, setSearchOptions] = useState([]);
    const [breadcrumbs, setBreadcrumbs] = useState(null)
    const [navigationOpen, setNavigationOpen] = useState(false)

    const i18nStrings = {
        searchIconAriaLabel: "Search",
        searchDismissIconAriaLabel: "Close search",
        overflowMenuTriggerText: "More",
        overflowMenuTitleText: "All",
        overflowMenuBackIconAriaLabel: "Back",
        overflowMenuDismissIconAriaLabel: "Close menu"
    }

    const identity = {
        href: "#",
        title: "Data Mesh UI"
    }

    const handleMenuClick = async(event) => {
        if (event.detail.id == "signout") {
            await Auth.signOut();
            window.location = "/";            
        }
    }

    useEffect(() => {
        (async function run() {
            const userInfo = await Auth.currentUserInfo();

            setNavUtilities([
                {
                    type: "menu-dropdown",
                    text: userInfo.username,
                    description: userInfo.attributes.email,
                    iconName: "user-profile",
                    items: [
                        {
                            id: "signout",
                            text: "Logout"
                        }
                    ],
                    onItemClick: handleMenuClick
                }
            ])
        })()
    }, [])

    const searchLoadItems = async() => {
        if (searchInput.length >= 3) {
            setSearchStatusType("loading")
            const searchUrl = `${searchApiUrl}/search/${searchInput}`
            const session = await Auth.currentSession()

            const results = await axios.get(searchUrl, {
                headers: {
                    Authorization: `Bearer ${session.getIdToken().getJwtToken()}`,
                },
            });

            const searchResults = results.data;
            if (!searchResults) {
                setSearchOptions([])    
            } else {
                const lowerCaseSearchTerm = searchInput.toLowerCase();
                const searchOptionsFormatted = searchResults.map((searchResult) => {
                    const resultArray = [];

                    const databaseName = searchResult.tableInformation.databaseName;
                    if (databaseName.toLowerCase().includes(lowerCaseSearchTerm)) {
                        resultArray.push({
                            label: databaseName,
                            tags: ["Database"],
                            value: JSON.stringify({type: "database", db: databaseName, label: databaseName})
                        });
                    }
            
                    const tableName = searchResult.tableInformation.tableName;
                    if (tableName.toLowerCase().includes(lowerCaseSearchTerm)) {
                        resultArray.push({
                            label: tableName,
                            description: `${databaseName}.${tableName}`,
                            tags: ["Table"],
                            value: JSON.stringify({type: "table", db: databaseName, table: tableName, label: tableName})
                        });
                    }
            
                    const columnNames = searchResult.tableInformation.columnNames;
                    columnNames.forEach((columnName) => {
                        if (columnName.toLowerCase().includes(lowerCaseSearchTerm)) {
                            resultArray.push({
                                label: columnName,
                                description: `${databaseName}.${tableName}.${columnName}`,
                                tags: ["Column"],
                                value: JSON.stringify({type: "table", db: databaseName, table: tableName, label: columnName})
                            });
                        }
                    });
            
                    return resultArray;
                })

                setSearchOptions(searchOptionsFormatted.flat())
            }
            setSearchStatusType("finished")
        } else {
            setSearchOptions([])
        }
        
    }

    const onSearchSelect = ({detail}) => {
        const payload = JSON.parse(detail.value)
        setSearchInput(payload.label)
        if (payload.type == "database") {
            window.location.href = `/tables/${payload.db}`
        } else {
            window.location.href = `/request-access/${payload.db}/${payload.table}`
        }
    }

    return (
        <Box>
            <TopNavigation identity={identity} i18nStrings={i18nStrings} utilities={navUtilities} search={
                <Autosuggest onSelect={onSearchSelect} onLoadItems={searchLoadItems} options={searchOptions} statusType={searchStatusType} loadingText="Search objects" errorText="Error fetching objects" enteredTextLabel={(value) => value} onChange={({detail}) => {setSearchInput(detail.value)}} value={searchInput} />
            }  />
            <AppLayout navigationOpen={navigationOpen} onNavigationChange={({detail}) => setNavigationOpen(detail.open)} breadcrumbs={breadcrumbs} navigation={
            <SideNavigation 
                activeHref={window.location.pathname} 
                items={[
                    {type: "link", text: "Data Domains", href: "/"},
                    {type: "link", text: "Sharing Workflow Executions", href: "/workflow-executions"},
                ]}
                onFollow={async(event) => {
                    event.preventDefault();
                    window.location = event.detail.href;
                }}
                />
        } content={
            <BrowserRouter>
                <Routes>
                    <Route exact path="/" element={<CatalogComponent />} />
                    <Route exact path="/tables/:dbname" element={<CatalogTablesComponent breadcrumbsCallback={setBreadcrumbs} />} />
                    <Route exact path="/request-access/:dbname/:tablename" element={<TableDetailsComponent breadcrumbsCallback={setBreadcrumbs} />} />
                    <Route exact path="/workflow-executions" element={<WorkflowExecutionsComponent />} />
                    <Route exact path="/search" element={<SearchComponent />} />
                    <Route exact path="/data-product-details/:dataProduct" element={<DataProductDetailsComponent />} />
                    <Route exact path="/execution-details/:execArn" element={<WorkflowExecutionDetailsComponent />} />
                    <Route exact path="/product-registration/:domainId/new" element={<RegisterNewProductComponent />} />
                    {/* <Route exact path="/data-quality-reports/:dbname/:tablename">
                        <DataQualityReportsComponent />
                    </Route>
                    <Route exact path="/data-quality-report-results/:dbname/:tablename/:bucket/:key">
                        <DataQualityReportResultsComponent />
                    </Route> */}
                </Routes>
            </BrowserRouter>
        } tools={
            <Box variant="p" padding={{vertical: "m", horizontal: "m"}}>
                Additional Resources:
                <ul>
                    <li><Link target="_blank" href="https://catalog.us-east-1.prod.workshops.aws/workshops/23e6326b-58ee-4ab0-9bc7-3c8d730eb851/en-US">Build a Data Mesh Workshop</Link></li>
                </ul>
            </Box>
        } />
        </Box>
    );
}

export default MainComponent;