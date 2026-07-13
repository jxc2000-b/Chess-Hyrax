import "../app.css";

type PrivacyPolicyPageProps = {
    onBack?: () => void;
};

function PrivacyPolicyPage({ onBack }: PrivacyPolicyPageProps) {
    return (
        <>
        <main className="main-page">
            <a className="privacy-page__home" href="/">Chess Hyrax</a>
            <h1>Privacy Policy</h1>
        </main>
        </>
    )
}

export default PrivacyPolicyPage;
