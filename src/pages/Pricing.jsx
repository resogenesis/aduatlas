import { useState } from "react";
import { FiCheck } from "react-icons/fi";
import { BiBookOpen, BiMap } from "react-icons/bi";
import { HiOutlineCurrencyDollar, HiOutlineShieldCheck } from "react-icons/hi2";
import Accordion from "../components/common/Accordion";
import img from "../assets/home/choose_img2.png";

const proTiers = [
  {
    name: "Single-State Listing",
    price: "$199",
    per: "/month",
    features: ["Listed in one U.S. state", "Homeowner lead notifications", "Profile page + photo gallery", "Supplier directory placement"],
    highlight: false,
  },
  {
    name: "Regional Builder Plan",
    price: "$399",
    per: "/month",
    features: ["Up to 5 states or 1 region", "Priority placement", "Homeowner lead notifications", "Supplier directory placement"],
    highlight: true,
  },
  {
    name: "National Builder Plan",
    price: "$999",
    per: "/month",
    features: ["Listed in all 50 states", "Top placement in all searches", "Dedicated account manager", "Feature in weekly homeowner emails"],
    highlight: false,
  },
];

const homeTiers = [
  {
    name: "24-Hour Access",
    price: "$9",
    per: "/day",
    features: ["Unlimited state rules", "Feasibility checklist access", "Utility cost estimator", "Bookmark builders"],
    highlight: false,
  },
  {
    name: "30-Day Access",
    price: "$29",
    per: "/month",
    features: ["Everything in 24-hour", "Save multiple properties", "Lead match with builders", "Downloadable worksheets"],
    highlight: true,
  },
  {
    name: "Annual Access",
    price: "$99",
    per: "/year",
    features: ["Everything in 30-day", "Priority builder introductions", "Early access to new tools", "Phone support"],
    highlight: false,
  },
];

const addOns = [
  { icon: BiMap, title: "Additional State", price: "$59", desc: "Extend your listing to an additional U.S. state." },
  { icon: HiOutlineCurrencyDollar, title: "Video Library Listing", price: "$99", desc: "Feature your build in our Video Library." },
];

const alwaysFree = [
  { icon: BiBookOpen, title: "State ADU Information", desc: "Browse statewide ADU summaries any time." },
  { icon: BiMap, title: "Location Search", desc: "Search national builder directory without an account." },
  { icon: HiOutlineShieldCheck, title: "Educational Content", desc: "Guides, explainers, and FAQ access." },
  { icon: HiOutlineCurrencyDollar, title: "Newsletter", desc: "Weekly digest of new state rules and tools." },
];

const faqs = [
  { q: "Can I cancel anytime?", a: "Yes — cancel from your dashboard. Access continues through the end of your billing period." },
  { q: "How can I use the coupon?", a: "Enter your coupon code at checkout to apply a discount." },
  { q: "Do monthly plans auto-renew?", a: "Yes, they renew at the end of each cycle unless cancelled." },
  { q: "What if my lot doesn't qualify?", a: "Homeowner plans include a feasibility check — if your lot isn't eligible, we'll refund within 7 days." },
];

const Tier = ({ t }) => (
  <div className={`rounded-2xl p-6 sm:p-8 flex flex-col gap-5 border ${t.highlight ? "bg-[#2F5D50] text-white border-[#2F5D50] shadow-lg" : "bg-white border-gray-200"}`}>
    <div>
      <h4 className={`text-lg font-semibold ${t.highlight ? "text-white" : "text-primary"}`}>{t.name}</h4>
      <div className="mt-3 flex items-end gap-1">
        <span className="text-4xl font-bold">{t.price}</span>
        <span className={`text-sm ${t.highlight ? "text-white/80" : "text-gray-500"}`}>{t.per}</span>
      </div>
    </div>
    <ul className="flex flex-col gap-2 text-sm">
      {t.features.map((f) => (
        <li key={f} className="flex items-start gap-2">
          <FiCheck className={`mt-0.5 ${t.highlight ? "text-white" : "text-[#2F5D50]"}`} />
          <span>{f}</span>
        </li>
      ))}
    </ul>
    <button className={`py-3 rounded-md font-semibold text-sm cursor-pointer ${t.highlight ? "bg-white text-[#2F5D50] hover:bg-white/90" : "bg-[#2F5D50] text-white hover:bg-[#244A40]"}`}>
      Get Started
    </button>
  </div>
);

const Pricing = () => {
  const [role, setRole] = useState("pro");
  const tiers = role === "pro" ? proTiers : homeTiers;

  return (
    <div>
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="text-center text-3xl sm:text-4xl font-bold text-primary">Builder & Supplier Listing</h1>
        <p className="text-center text-gray-500 mt-1">Beta Pricing · 7 Days Lock-In</p>

        <div className="flex justify-center my-6">
          <div className="inline-flex gap-1 bg-[#F4F7F6] p-1 rounded-lg">
            <button onClick={() => setRole("homeowner")} className={`px-5 py-2.5 rounded-md text-sm font-semibold ${role === "homeowner" ? "bg-[#2F5D50] text-white" : "text-gray-700"}`}>I am a Homeowner</button>
            <button onClick={() => setRole("pro")} className={`px-5 py-2.5 rounded-md text-sm font-semibold ${role === "pro" ? "bg-[#2F5D50] text-white" : "text-gray-700"}`}>I am a Professional</button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {tiers.map((t) => <Tier key={t.name} t={t} />)}
        </div>

        {role === "pro" && (
          <>
            <h3 className="text-center text-xl font-semibold mt-12 mb-4">Optional Add-Ons</h3>
            <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
              {addOns.map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.title} className="bg-[#F4F7F6] rounded-xl p-5 flex gap-4">
                    <div className="w-10 h-10 shrink-0 rounded-lg bg-[#2F5D50] text-white flex items-center justify-center"><Icon /></div>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <h4 className="font-semibold text-primary">{a.title}</h4>
                        <span className="font-bold text-[#2F5D50]">{a.price}</span>
                      </div>
                      <p className="text-sm text-secondary mt-1">{a.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="bg-[#F4F7F6] py-14">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-semibold text-primary">Always Free</h2>
          <p className="text-secondary mt-2">Here’s what’s available without a subscription.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
            {alwaysFree.map((a) => {
              const Icon = a.icon;
              return (
                <div key={a.title} className="bg-white rounded-xl p-5">
                  <div className="w-10 h-10 rounded-lg bg-[#2F5D50] text-white flex items-center justify-center mb-3"><Icon /></div>
                  <h4 className="font-semibold text-primary mb-1">{a.title}</h4>
                  <p className="text-sm text-secondary">{a.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 py-14 grid lg:grid-cols-2 gap-10 items-start">
        <div>
          <h2 className="text-3xl sm:text-4xl font-semibold text-primary mb-6">Frequently Asked Questions</h2>
          <Accordion items={faqs} />
        </div>
        <img src={img} alt="" className="rounded-2xl w-full object-cover aspect-square" />
      </section>

      <section className="bg-[#2F5D50] py-10">
        <div className="container mx-auto px-4 sm:px-6 text-center text-white">
          <h3 className="text-2xl font-semibold">Ready to Start Planning?</h3>
          <p className="text-white/80 mt-1">Join ADUAtlas and get matched with your next step.</p>
          <button className="mt-4 px-6 py-3 bg-white text-[#2F5D50] font-semibold rounded-md">Get Started</button>
        </div>
      </section>
    </div>
  );
};

export default Pricing;
