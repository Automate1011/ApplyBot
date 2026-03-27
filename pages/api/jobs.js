// pages/api/jobs.js
// This runs on the SERVER - so Reed API calls work perfectly, no CORS

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { keywords, location, jobType, resultsToTake = 20 } = req.query;

  if (!keywords) {
    return res.status(400).json({ error: "keywords is required" });
  }

  const REED_API_KEY = process.env.REED_API_KEY;
  if (!REED_API_KEY) {
    return res.status(500).json({ error: "REED_API_KEY not configured in environment variables" });
  }

  try {
    const params = new URLSearchParams({
      keywords:             keywords,
      location:             location || "London",
      distancefromlocation: 15,
      resultsToTake:        parseInt(resultsToTake),
      resultsToSkip:        0,
    });

    if (jobType === "Full Time")  params.set("fullTime", "true");
    if (jobType === "Part Time")  params.set("partTime", "true");
    if (jobType === "Contract")   params.set("contract", "true");
    if (jobType === "Temporary")  params.set("temp",     "true");

    const auth = Buffer.from(`${REED_API_KEY}:`).toString("base64");

    const response = await fetch(
      `https://www.reed.co.uk/api/1.0/search?${params}`,
      {
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type":  "application/json",
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: `Reed API error ${response.status}: ${text.slice(0, 200)}`
      });
    }

    const data = await response.json();

    const jobs = (data.results || []).map(j => ({
      id:          String(j.jobId),
      title:       j.jobTitle        || "Untitled",
      company:     j.employerName    || "Unknown",
      location:    j.locationName    || location || "UK",
      salary:      j.minimumSalary
                     ? `£${Math.round(j.minimumSalary / 1000)}k${j.maximumSalary ? `–£${Math.round(j.maximumSalary / 1000)}k` : ""}`
                     : (j.salaryDescription || "Salary not listed"),
      description: j.jobDescription  || j.jobTitle || "",
      url:         j.jobUrl          || `https://www.reed.co.uk/jobs/${j.jobId}`,
      posted:      j.date ? new Date(j.date).toLocaleDateString("en-GB") : "Recently",
    }));

    return res.status(200).json({ jobs, total: jobs.length });

  } catch (error) {
    return res.status(500).json({ error: `Server error: ${error.message}` });
  }
}
