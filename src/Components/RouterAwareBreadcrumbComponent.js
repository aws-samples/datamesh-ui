import { BreadcrumbGroup } from "@cloudscape-design/components"
import { useNavigate } from "react-router"

function RouterAwareBreadcrumbComponent(props) {
    const navigate = useNavigate()
    return (
        <BreadcrumbGroup items={props.items} onClick={(event) => {
            event.preventDefault()
            const location = event.detail.href
            navigate(location)
        }} />
    )
}

export default RouterAwareBreadcrumbComponent