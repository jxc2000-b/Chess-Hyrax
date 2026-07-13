import "../app.css";

type TermsOfServicePropsProps = {
    onBack?: () => void;
};

function TermsOfServiceProps({ onBack }: TermsOfServicePropsProps) {
    return (
        <>
        <main className="main-page">
            <a className="privacy-page__home" href="/">Chess Hyrax</a>
            <h1>Terms of Service</h1>
        </main>
        </>
    )
}

export default TermsOfServiceProps;
