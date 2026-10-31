import "./ContactSection.css";

function ContactSection() {
  return (

    <section className="contact-section">

      <div className="container contact-wrapper">

        <div className="contact-left">

          <p className="contact-tag">
            Contact us
          </p>

          <h2>
            Start managing your patients
          </h2>

          <p>

            We'd love to learn more about your organisation and how
            Lably can help simplify patient sample collection.

          </p>

        </div>

        <form className="contact-form">

          <div className="form-grid">

            <div className="form-group">
              <label>
                First name *
              </label>
              <input type="text"/>
            </div>

            <div className="form-group">
              <label>
                Last name *
              </label>
              <input type="text"/>
            </div>

            <div className="form-group">
              <label>
                Phone number *
              </label>
              <input type="tel"/>
            </div>

            <div className="form-group">
              <label>
                Email address *
              </label>
              <input type="email"/>
            </div>

            <div className="form-group">
              <label>
                Company name *
              </label>
              <input type="text"/>
            </div>

            <div className="form-group">
              <label>
                Job title *
              </label>
              <input type="text"/>
            </div>

            <div className="form-group full-width">
              <label>
                Estimated number of rides per week *
              </label>
              <input type="number"/>
            </div>

            <div className="form-group full-width">
              <label>
                Tell us more about your organization *
              </label>

              <textarea rows="5"/>

            </div>

          </div>

          <small>

            * required fields

          </small>

          <button
            type="submit"
            className="submit-button"
          >

            Contact us

          </button>

        </form>

      </div>

    </section>

  );
}

export default ContactSection;