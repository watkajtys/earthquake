import { Helmet } from "react-helmet-async";

export default function EarthquakeSafetyPage() {
  return (
    <>
      <Helmet>
        <title>Earthquake Safety</title>
        <meta
          name="description"
          content="Learn about earthquake safety and how to prepare for an earthquake."
        />
      </Helmet>
      <article>
        <h1>Earthquake Safety</h1>
        <p>
          This is a placeholder for an article about earthquake safety.
        </p>
      </article>
    </>
  );
}
