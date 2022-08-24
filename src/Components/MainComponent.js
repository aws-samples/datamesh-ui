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
import { AppLayout, SideNavigation, Box, TopNavigation, Link } from "@cloudscape-design/components";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import CatalogComponent from "./CatalogComponent";
import CatalogTablesComponent from "./CatalogTablesComponent";
import {Auth} from "aws-amplify";
import WorkflowExecutionsComponent from "./WorkflowExecutionsComponent";
import WorkflowExecutionDetailsComponent from "./WorkflowExecutionDetailsComponent";
import TableDetailsComponent from "./TableDetailsComponent";
import ProductRegistrationListComponent from "./ProductRegistrationListComponent";
import RegisterNewProductComponent from "./RegisterNewProductComponent";
import SearchComponent from "./SearchComponent";
import DataProductDetailsComponent from "./DataProductDetailsComponent"
import DataQualityReportsComponent from "./QualityUI/DataQualityReportsComponent";
import DataQualityReportResultsComponent from "./QualityUI/DataQualityReportResultsComponent";
import { useEffect, useState } from "react";

function MainComponent(props) {
    const [navUtilities, setNavUtilities] = useState([]);

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

    useEffect(async() => {
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

    }, [])

    return (
        <Box>
            <TopNavigation identity={identity} i18nStrings={i18nStrings} utilities={navUtilities} />
            <AppLayout navigation={
            <SideNavigation 
                activeHref={window.location.pathname} 
                items={[
                    {type: "link", text: "Data Domains", href: "/"},
                    {type: "link", text: "Sharing Workflow Executions", href: "/workflow-executions"},
                    {type: "link", text: "Search", href: "/search"}
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
                    <Route exact path="/tables/:dbname" element={<CatalogTablesComponent />} />
                    <Route exact path="/request-access/:dbname/:tablename" element={<TableDetailsComponent />} />
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