import { buttonClass } from "@/components/site/button";
import { PageHeader } from "@/components/site/page-header";
import { LAB, mailto } from "@/lib/site/lab";

export const metadata = { title: "Contact" };

/**
 * The contact page: where the lab is, and how to write to it.
 *
 * No form. The lab's previous site had one, but this site is served as static files and has
 * nothing to receive a submission, and a form that posts nowhere is worse than none. The page is
 * the address and an email action instead.
 *
 * The address is shown as text as well as a button. A mailto link does nothing on a machine with
 * no mail client configured, which is common on a desktop; the visible address is what such a
 * visitor copies. No phone number either: the only one the previous site listed was its site
 * builder's placeholder.
 */
export default function Page() {
  return (
    <>
      <PageHeader title="Contact" />

      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 sm:py-20 md:grid-cols-2">
        <section>
          <h2 className="text-site-ink/70 text-xs font-medium tracking-[0.2em] uppercase">
            Visit
          </h2>
          <address className="font-display mt-4 text-xl leading-relaxed not-italic">
            {LAB.legalName}
            <br />
            {LAB.institution}
            {LAB.address.map((line) => (
              <span key={line}>
                <br />
                {line}
              </span>
            ))}
          </address>
        </section>

        <section>
          <h2 className="text-site-ink/70 text-xs font-medium tracking-[0.2em] uppercase">
            Write
          </h2>
          {/* `select-all` so one click selects the whole address for copying. */}
          <p className="font-display mt-4 text-xl select-all">{LAB.email}</p>
          <a
            href={mailto()}
            className={`${buttonClass()} mt-6`}
          >
            Email the lab
          </a>
        </section>
      </div>
    </>
  );
}
