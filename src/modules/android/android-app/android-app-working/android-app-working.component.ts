import { Component, Input, Output } from 'angular-ts-decorators';
import { autobind } from 'core-decorators';
import Strings from '../../../../../res/strings/en.json';
import { AppHelperService } from '../../../app/app.interface';
import AlertService from '../../../shared/alert/alert.service';
import { PlatformService } from '../../../shared/global-shared.interface';
import UtilityService from '../../../shared/utility/utility.service';
import { WorkingContext } from '../../../shared/working/working.enum';
import WorkingService from '../../../shared/working/working.service';

@autobind
@Component({
  controllerAs: 'vm',
  selector: 'appWorking'
})
export default class AndroidAppWorkingComponent {
  $timeout: ng.ITimeoutService;
  alertSvc: AlertService;
  appHelperSvc: AppHelperService;
  platformSvc: PlatformService;
  utilitySvc: UtilityService;
  workingSvc: WorkingService;

  currentContext: WorkingContext;
  message: string;
  strings = Strings;
  currentTimeout: ng.IPromise<void>;

  @Output() cancelAction: () => any;

  static $inject = [
    '$scope',
    '$timeout',
    'AlertService',
    'AppHelperService',
    'PlatformService',
    'UtilityService',
    'WorkingService'
  ];
  constructor(
    $scope: ng.IScope,
    $timeout: ng.ITimeoutService,
    AlertSvc: AlertService,
    AppHelperSvc: AppHelperService,
    PlatformSvc: PlatformService,
    UtilitySvc: UtilityService,
    WorkingSvc: WorkingService
  ) {
    this.$timeout = $timeout;
    this.alertSvc = AlertSvc;
    this.appHelperSvc = AppHelperSvc;
    this.platformSvc = PlatformSvc;
    this.utilitySvc = UtilitySvc;
    this.workingSvc = WorkingSvc;

    // Watch working service for status changes to display spinner dialog
    $scope.$watch(
      () => WorkingSvc.status,
      (newVal, oldVal) => {
        if (newVal !== oldVal) {
          if (newVal.activated) {
            this.showSpinnerDialog(newVal.context);
          } else {
            this.hideSpinnerDialog();
          }
        }
      }
    );
  }

  cancelSync(): void {
    this.cancelAction()();
  }

  hideSpinnerDialog(): void {
    if (this.currentTimeout) {
      this.$timeout.cancel(this.currentTimeout);
    }
    this.currentContext = undefined;
    window.SpinnerDialog.hide();
  }

  showSpinnerDialog(context?: WorkingContext): void {
    // Return if spinner dialog already displayed
    if (this.currentContext) {
      return;
    }

    // Hide any alert messages
    this.alertSvc.clearCurrentAlert();

    // Set displayed message based on context
    this.currentContext = context;
    switch (context) {
      case WorkingContext.DelayedSyncing:
        this.currentTimeout = this.$timeout(() => {
          window.SpinnerDialog.show(null, `${this.platformSvc.getI18nString(Strings.working_Syncing_Message)}…`, true);
        }, 250);
        break;
      case WorkingContext.Restoring:
        this.currentTimeout = this.$timeout(() => {
          window.SpinnerDialog.show(
            null,
            `${this.platformSvc.getI18nString(Strings.working_Restoring_Message)}…`,
            true
          );
        });
        break;
      case WorkingContext.RetrievingMetadata:
        window.SpinnerDialog.hide();
        this.currentTimeout = this.$timeout(() => {
          window.SpinnerDialog.show(null, this.platformSvc.getI18nString(Strings.getMetadata_Message), () => {
            window.SpinnerDialog.hide();
            this.currentContext = undefined;
            this.cancelAction()();
          });
        }, 250);
        break;
      case WorkingContext.Syncing:
      default:
        this.currentTimeout = this.$timeout(() => {
          window.SpinnerDialog.show(null, `${this.platformSvc.getI18nString(Strings.working_Syncing_Message)}…`, true);
        });
    }
  }
}
