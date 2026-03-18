var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// HTTPS ist erforderlich für die Screen Capture API (getDisplayMedia)
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}
app.UseHttpsRedirection();

// Statische Dateien aus wwwroot servieren
app.UseDefaultFiles(); // Sucht automatisch nach index.html
app.UseStaticFiles();

// Fallback auf index.html für SPA-Routing
app.MapFallbackToFile("index.html");

app.Run();
