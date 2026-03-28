export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const ADZUNA_ID  = process.env.ADZUNA_APP_ID;
  const ADZUNA_KEY = process.env.ADZUNA_APP_KEY;

  if (!ADZUNA_ID || !ADZUNA_KEY) {
    return res.status(500).json({ error: "ADZUNA_APP_ID or ADZUNA_APP_KEY not set in Vercel environment variables" });
  }

  const { keywords, location, jobType } = req.query;
  if (!keywords) return res.status(400).json({ error: "keywords is required" });

  try {
    const params = new URLSearchParams({
      app_id:           ADZUNA_ID,
      app_key:          ADZUNA_KEY,
      results_per_page: 20,
      what:             keywords,
      where:            location || "London",
      distance:         15,
    });

    if (jobType === "Full Time") params.set("full_time", "1");
    if (jobType === "Part Time") params.set("part_time", "1");
    if (jobType === "Contract")  params.set("contract",  "1");

    const url = `https://api.adzuna.com/v1/api/jobs/gb/search/1?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      const txt = await response.text();
      return res.status(response.status).json({ error: `Adzuna error ${response.status}: ${txt.slice(0, 200)}` });
    }

    const data = await response.json();

    if (data.exception) {
      return res.status(400).json({ error: `Adzuna rejected request: ${data.exception}` });
    }

    const jobs = (data.results || []).map(j => ({
      id:          String(j.id),
      title:       j.title                   || "Untitled",
      company:     j.company?.display_name   || "Unknown",
      location:    j.location?.display_name  || location || "UK",
      salary:      j.salary_min
                     ? "£" + Math.round(j.salary_min / 1000) + "k" + (j.salary_max ? "–£" + Math.round(j.salary_max / 1000) + "k" : "")
                     : "Salary not listed",
      description: j.description             || "",
      url:         j.redirect_url            || "#",
      posted:      j.created ? new Date(j.created).toLocaleDateString("en-GB") : "Recently",
    }));

    return res.status(200).json({ jobs, total: jobs.length });
  } catch (e) {
    return res.status(500).json({ error: "Server error: " + e.message });
  }
}
