// customization.js
// purpose: one-file site customization for branding, links, and theme colors
//
// Edit only the values below to customize this site for another brand/user.
// Keep values wrapped in quotes. Color values can be hex, rgb(), rgba(), hsl(), etc.

export const CUSTOMIZATION = Object.freeze({
  // SITE HEADER NAME: browser/tab title value
  siteHeaderName: "ANY N.E. GRAPPLING (DEV)",

  // CONTACT LINK: message icon destination
  contactLink: "https://ig.me/m/any.jiujitsu",

  // INSTAGRAM LINK: instagram icon destination
  instagramLink: "https://www.instagram.com/any.jiujitsu/",

  // PAGE HEADER COLOR: title/filter/header accent color
  pageHeaderColor: "#234c31",

  // ICON(s) COLOR: top social icons + row helper icons
  iconsColor: "#234c31",

  // PAGE BACKGROUND COLOR
  pageBackgroundColor: "#ebebeb",

  // TABLE HEADER COLUMN COLOR: highlighted first/event column color
  tableHeaderColumnColor: "rgba(232, 221, 198, 0.85)",

  // TABLE FIELD COLUMN COLOR: main row/card background color
  tableFieldColumnColor: "#e2e4e4",

  // TABLE TEXT LINE 1 COLOR: primary row text color
  tableTextLine1Color: "#111111",

  // TABLE TEXT LINE 2 COLOR: secondary/sub row text color
  tableTextLine2Color: "rgba(0, 0, 0, 0.55)",
});

const CSS_VARIABLES = Object.freeze({
  pageHeaderColor: "--page-header-color",
  iconsColor: "--icons-color",
  pageBackgroundColor: "--page-background-color",
  tableHeaderColumnColor: "--table-header-column-color",
  tableFieldColumnColor: "--table-field-column-color",
  tableTextLine1Color: "--table-text-line-1-color",
  tableTextLine2Color: "--table-text-line-2-color",
});

export function applyCustomization(customization = CUSTOMIZATION){
  const root = document.documentElement;

  for(const [key, cssVar] of Object.entries(CSS_VARIABLES)){
    const value = customization[key];
    if(typeof value === "string" && value.trim()){
      root.style.setProperty(cssVar, value.trim());
    }
  }

  if(typeof customization.siteHeaderName === "string" && customization.siteHeaderName.trim()){
    document.title = customization.siteHeaderName.trim();
  }

  const instagramLink = document.querySelector('[data-customization-link="instagram"]');
  if(instagramLink && typeof customization.instagramLink === "string" && customization.instagramLink.trim()){
    instagramLink.href = customization.instagramLink.trim();
  }

  const githubLink = document.querySelector('[data-customization-link="github"]');
  if(githubLink && typeof customization.githubLink === "string" && customization.githubLink.trim()){
    githubLink.href = customization.githubLink.trim();
  }

  const contactLink = document.querySelector('[data-customization-link="contact"]');
  if(contactLink && typeof customization.contactLink === "string" && customization.contactLink.trim()){
    contactLink.href = customization.contactLink.trim();
  }
}
