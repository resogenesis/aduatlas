
import { Outlet, ScrollRestoration } from "react-router-dom"
import Footer from "../components/common/Footer"
import Header from "../components/common/Header"
import { Fragment } from "react"
const RootLayout = () => {
    return (
        <Fragment>
            <Header />
            <main className="w-full min-h-screen overflow-x-hidden">
                <Outlet />
            </main>
            <Footer />
            <ScrollRestoration />
        </Fragment>
    )
}
export default RootLayout