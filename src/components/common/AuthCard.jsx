const AuthCard = ({ title, subtitle, children, footer }) => {
  return (
    <section className="min-h-[calc(100vh-200px)] bg-[#F4F7F6] py-12 sm:py-16 px-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm p-6 sm:p-10">
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="mt-6 text-center text-sm text-gray-600">{footer}</div>}
        <p className="mt-4 text-center text-xs text-gray-400">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </section>
  );
};

export default AuthCard;
