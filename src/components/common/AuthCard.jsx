import Logomark from "../brand/Logomark";

const AuthCard = ({ title, subtitle, children, footer, eyebrow }) => {
  return (
    <section className="relative min-h-[calc(100vh-100px)] bg-canvas py-16 sm:py-24 px-5 sm:px-8 overflow-hidden">
      {/* ambient blobs */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 w-[36rem] h-[36rem] rounded-full bg-accent/8 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-40 w-[36rem] h-[36rem] rounded-full bg-accent/4 blur-3xl" />

      <div className="relative max-w-md mx-auto">
        <div className="flex justify-center mb-8 text-paper">
          <Logomark className="h-7" />
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-10">
          <div className="text-center mb-8">
            {eyebrow && (
              <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
                {eyebrow}
              </p>
            )}
            <h1 className="font-display font-medium text-paper text-3xl sm:text-4xl leading-tight tracking-tight">
              {title}
            </h1>
            {subtitle && <p className="mt-3 text-paper-dim text-sm sm:text-base leading-relaxed">{subtitle}</p>}
          </div>

          {children}

          {footer && <div className="mt-7 text-center text-sm text-paper-dim">{footer}</div>}
        </div>

        <p className="mt-5 text-center text-xs text-paper-dim/60">
          By continuing, you agree to our <a href="#" className="hover:text-paper-dim underline-offset-2 hover:underline">Terms</a> and <a href="#" className="hover:text-paper-dim underline-offset-2 hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </section>
  );
};

export default AuthCard;
