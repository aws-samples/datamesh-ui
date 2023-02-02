import { ButtonDropdown } from "@cloudscape-design/components"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import DataDomain from "../Backend/DataDomain"

function DataDomainActionComponent(props) {
    const [owner, setOwner] = useState(false)
    const navigate = useNavigate()
    useEffect(() => {
        async function run() {
            setOwner(await DataDomain.isOwner(props.item.Parameters.data_owner))
        }

        run()
    }, [])

    return (
        <ButtonDropdown expandToViewport="true" items={[
            {id: `register::${props.item.Name}`, text: "Register Data Product", disabled: !owner, disabledReason: "Not Data Owner"},
            {id: `view::${props.item.Name}`, text: "View Tables"}
        ]} onItemClick={(event) => {
            const [type, id] = event.detail.id.split("::")

            const url = type == "register" ? `/product-registration/${id}/new` : `/tables/${id}`
            navigate(url)
        }}>Actions</ButtonDropdown>
    )
}

export default DataDomainActionComponent