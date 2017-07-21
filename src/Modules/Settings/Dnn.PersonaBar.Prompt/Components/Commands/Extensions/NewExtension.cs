﻿using System;
using System.IO;
using System.Text;
using System.Web.UI;
using Dnn.PersonaBar.Library.Prompt;
using Dnn.PersonaBar.Library.Prompt.Attributes;
using Dnn.PersonaBar.Library.Prompt.Models;
using DotNetNuke.Common;
using DotNetNuke.Common.Utilities;
using DotNetNuke.Entities.Portals;
using DotNetNuke.Entities.Users;
using DotNetNuke.Instrumentation;

namespace Dnn.PersonaBar.Prompt.Components.Commands.Extensions
{
    [ConsoleCommand("new-extension", "Creates a new extension from a manifest or package", new[] { "path" })]
    public class NewExtension : ConsoleCommandBase
    {
        private static readonly ILog Logger = LoggerSource.Instance.GetLogger(typeof(NewExtension));

        private const string FlagPath = "path";
        private string _path = "";
        private bool _isPackage;

        private bool _isManifest;
        public override void Init(string[] args, PortalSettings portalSettings, UserInfo userInfo, int activeTabId)
        {
            base.Init(args, portalSettings, userInfo, activeTabId);
            var sbErrors = new StringBuilder();

            if (HasFlag(FlagPath))
            {
                _path = Flag(FlagPath);
            }
            else if (args.Length >= 2 && !IsFlag(args[1]))
            {
                // assume first argument is the module name
                _path = args[1];
            }
            else
            {
                sbErrors.AppendFormat("You must supply the path to the extension package or manifest");
            }
            _path = _path.ToLower().Replace("/", "\\");
            if (_path.EndsWith(".dnn"))
            {
                _isManifest = true;
            }
            else if (_path.EndsWith(".zip"))
            {
                _isPackage = true;
            }
            else
            {
                sbErrors.AppendFormat("You must supply a path to a package (.zip) or a manifest (.dnn)");
            }

            _path = _path.TrimStart("~".ToCharArray()).TrimStart("/".ToCharArray());
            if (_path.StartsWith("desktopmodules"))
            {
                _path = _path.Substring(15);
            }
            _path = Path.Combine(Globals.ApplicationMapPath, "desktopmodules/" + _path);
            if (File.Exists(_path))
            {
            }
            else
            {
                sbErrors.AppendFormat("Cannot find {0}", _path);
            }

            ValidationMessage = sbErrors.ToString();
        }

        public override ConsoleResultModel Run()
        {

            var res = "";
            try
            {
                if (_isPackage)
                {
                    res = InstallPackage(PortalSettings, User, _path);
                }
                else if (_isManifest)
                {
                    var installer = new DotNetNuke.Services.Installer.Installer(_path, Globals.ApplicationMapPath, true);
                    if (installer.IsValid)
                    {
                        installer.InstallerInfo.Log.Logs.Clear();
                        installer.Install();
                        if (installer.IsValid)
                        {
                            res = $"<strong>Successfully added {_path}</strong>";
                            // Return installer.InstallerInfo.PackageID
                        }
                        else
                        {
                            return new ConsoleErrorResultModel("An error occurred while attempting to add the extension. Please see the DNN Event Viewer for details.");
                        }
                    }
                }

            }
            catch (Exception ex)
            {
                Logger.Error(ex);
                return new ConsoleErrorResultModel("An error occurred while attempting to add the extension. Please see the DNN Event Viewer for details.");
            }
            return new ConsoleResultModel(res) { IsHtml = true };
        }

        public string InstallPackage(PortalSettings portalSettings, UserInfo user, string filePath)
        {
            //Dim installResult = New InstallResultDto()
            var fileName = Path.GetFileName(_path);
            string result;
            try
            {
                using (var stream = File.OpenRead(_path))
                {
                    var installer = GetInstaller(stream, fileName, portalSettings.PortalId);

                    try
                    {
                        if (installer.IsValid)
                        {
                            //Reset Log
                            installer.InstallerInfo.Log.Logs.Clear();

                            //Set the IgnnoreWhiteList flag
                            installer.InstallerInfo.IgnoreWhiteList = true;

                            //Set the Repair flag
                            installer.InstallerInfo.RepairInstall = true;

                            //Install
                            installer.Install();
                            if (!installer.IsValid)
                            {
                                result = "Install Error";
                            }
                            else
                            {
                                using (var sw = new StringWriter())
                                {
                                    installer.InstallerInfo.Log.GetLogsTable().RenderControl(new HtmlTextWriter(sw));
                                    result = sw.ToString();
                                }
                            }
                        }
                        else
                        {
                            result = "Install Error";
                        }
                    }
                    finally
                    {
                        DeleteTempInstallFiles(installer);
                    }
                }
            }
            catch (Exception ex)
            {
                Logger.Error(ex);
                result = "ZipCriticalError";
            }
            return result;
        }

        private static DotNetNuke.Services.Installer.Installer GetInstaller(Stream stream, string fileName, int portalId, string legacySkin = null)
        {
            var installer = new DotNetNuke.Services.Installer.Installer(stream, Globals.ApplicationMapPath, false, false);
            // We always assume we are installing from //Host/Extensions (in the previous releases)
            // This will not work when we try to install a skin/container under a specific portal.
            installer.InstallerInfo.PortalID = Null.NullInteger;
            //Read the manifest
            if (installer.InstallerInfo.ManifestFile != null)
            {
                installer.ReadManifest(true);
            }
            return installer;
        }

        private static void DeleteTempInstallFiles(DotNetNuke.Services.Installer.Installer installer)
        {
            try
            {
                var tempFolder = installer.TempInstallFolder;
                if (!string.IsNullOrEmpty(tempFolder) && Directory.Exists(tempFolder))
                {
                    Globals.DeleteFolderRecursive(tempFolder);
                }
            }
            catch (Exception ex)
            {
                Logger.Error(ex);
            }
        }
    }
}