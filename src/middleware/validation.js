export function requireFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter((field) => {
      const value = req.body?.[field];
      return value === undefined || value === null || value === "";
    });

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: "Skill issue. Required fields are missing.",
        missingFields: missing,
        requestId: req.requestId
      });
    }

    next();
  };
}
