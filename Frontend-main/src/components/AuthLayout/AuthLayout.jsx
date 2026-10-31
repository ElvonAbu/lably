import "./AuthLayout.css";

function AuthLayout({ illustration, children }) {
  return (
    <main className="auth-layout">

      <section className="auth-layout__left">

        <div className="auth-layout__form">

          {children}

        </div>

      </section>

      <section className="auth-layout__right">

        {illustration}

      </section>

    </main>
  );
}

export default AuthLayout;